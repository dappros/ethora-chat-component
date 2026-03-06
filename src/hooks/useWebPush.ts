/**
 * useWebPush.ts
 * React hook that orchestrates the full Web Push subscription lifecycle:
 *  1. Check browser support
 *  2. Register the service worker
 *  3. Request notification permission
 *  4. Subscribe via PushManager
 *  5. Register the subscription with the Ethora backend (API)
 *  6. Listen for subscription-change messages from the SW and re-register
 *
 * Logs every major step to the console so developers can trace the flow.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../roomStore';
import {
  initPushNotifications,
  listenForForegroundMessages,
} from '../utils/firebasePushManager';
import { registerPushToken } from '../networking/api-requests/push.api';
import { messageNotificationManager } from '../utils/messageNotificationManager';
import { IMessage } from '../types/models/message.model';
import { pushSubscriptionService } from '../utils/pushSubscriptionService';
import { getGlobalXmppClient } from '../utils/clientRegistry';
import { IConfig } from '../types/types';
import {
  buildNotificationUrl,
  hasMessageInRooms,
  isSystemPayload,
  shouldShowForegroundOsPush,
  shouldShowForegroundPushToast,
} from '../utils/notificationPolicy';

interface UseWebPushOptions {
  /** Enable or disable the web push flow. Default: true */
  enabled?: boolean;

  /**
   * URL-safe Base64 encoded VAPID public key.
   * Falls back to the VITE_VAPID_PUBLIC_KEY environment variable.
   */
  vapidPublicKey?: string;

  /**
   * Service worker path and scope for Firebase Messaging.
   * Defaults to `/firebase-messaging-sw.js` with scope `/`.
   */
  serviceWorkerPath?: string;
  serviceWorkerScope?: string;

  /**
   * Custom Firebase configuration object.
   * If provided, it overrides the environment variables.
   */
  firebaseConfig?: any;

  /**
   * Show a UI "soft ask" before triggering the browser permission dialog.
   * When true the hook will NOT immediately request permission;
   * instead the consumer should call `requestPermission()` manually.
   * Default: false (immediate request after login).
   */
  softAsk?: boolean;
}

interface UseWebPushResult {
  /** Manually trigger the permission + subscription flow (for soft-ask UIs). */
  requestPermission: () => Promise<void>;
}

let _subscriptionRegistered = false; // module-level guard to prevent duplicate subscriptions
let _foregroundHandlers = new Set<(payload: any) => void>();
let _foregroundUnsubscribe: (() => void) | null = null;

const useWebPush = (options: UseWebPushOptions = {}): UseWebPushResult => {
  const { softAsk = false, enabled = false } = options;

  // Resolve VAPID key: hook option > env variable > empty string
  const vapidPublicKey =
    options.vapidPublicKey ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY) ||
    '';

  // Read the user token from Redux — we only run push setup once the user is logged in
  const userToken = useSelector((state: RootState) => state.chatSettingStore.user.token);
  const userXmppUsername = useSelector(
    (state: RootState) => state.chatSettingStore.user.xmppUsername
  );
  const roomsMap = useSelector((state: RootState) => state.rooms.rooms);
  const config = useSelector((state: RootState) => state.chatSettingStore.config as IConfig | undefined);

  const hasRanRef = useRef(false);
  const fcmTokenRef = useRef<string | null>(null);
  // State-based mirror of fcmTokenRef so effects can react to token readiness.
  const [fcmTokenReady, setFcmTokenReady] = useState<string | null>(null);
  const recentPushToastsRef = useRef<Map<string, number>>(new Map());
  const lastRoomsHashRef = useRef<string>('');

  // ─────────────────────────────────────────────────────────────────────────────
  const runPushFlow = useCallback(async () => {
    try {
      if (!enabled) return;
      if (_subscriptionRegistered) {
        console.log('[WebPush] Already subscribed this session, skipping.');
        return;
      }

      console.log('[WebPush] Initializing FCM push notifications…');
      const fcmToken = await initPushNotifications({
        vapidPublicKey,
        serviceWorkerPath: options.serviceWorkerPath,
        serviceWorkerScope: options.serviceWorkerScope,
        firebaseConfig: options.firebaseConfig || config?.webPush?.firebaseConfig,
      });

      if (!fcmToken) {
        console.warn('[WebPush] Failed to obtain FCM token.');
        return;
      }

      // Step 4 – Backend registration
      console.log('[WebPush] Registering FCM token with Ethora backend (API)…');
      await registerPushToken(fcmToken);

      _subscriptionRegistered = true;
      fcmTokenRef.current = fcmToken;
      setFcmTokenReady(fcmToken); // signal room-subscription effect

      // Log: subscribed via API
      console.log(
        `%c[WebPush] ✅ User subscribed via API – Token: ${fcmToken.substring(0, 15)}...`,
        'color: #22c55e; font-weight: bold'
      );

      // Log: XMPP session linked (informational)
      if (userXmppUsername) {
        console.log(
          `%c[WebPush] ✅ Device linked to XMPP – JID: ${userXmppUsername}`,
          'color: #3b82f6; font-weight: bold'
        );
      }
    } catch (error) {
      console.error('[WebPush] Registration error:', error);
    }
  }, [
    enabled,
    options.serviceWorkerPath,
    options.serviceWorkerScope,
    userXmppUsername,
    vapidPublicKey,
  ]);

  const showOsNotification = useCallback(
    async (title: string, notifOptions: NotificationOptions) => {
      if (typeof window === 'undefined') return;
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration(
          options.serviceWorkerScope || '/'
        );
        if (registration) {
          await registration.showNotification(title, notifOptions);
          return;
        }
      }

      new Notification(title, notifOptions);
    },
    [options.serviceWorkerScope]
  );

  // Foreground push handler: config-driven push/in-app behavior
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const handler = (payload: any) => {
      const data = payload.data ?? {};
      const title = payload.notification?.title || data.title || 'New message';
      const body =
        payload.notification?.body || data.body || 'You have a new message.';
      const roomJid = data.jid || '';
      const senderId = data.userJid || '';
      const messageId = payload.messageId || data.msgID || String(Date.now());
      const url = buildNotificationUrl(payload, window.location.origin);
      const isSystemMessage = isSystemPayload(payload);
      const isTabVisible = document.visibilityState === 'visible';

      const now = Date.now();
      const dedupeKey =
        payload.messageId ||
        data.msgID ||
        `${roomJid}|${senderId}|${title}|${body}`;
      const lastSeen = recentPushToastsRef.current.get(dedupeKey);
      const existingMessageId = payload.messageId || data.msgID;
      const alreadyInStore = hasMessageInRooms(roomsMap, existingMessageId);
      const xmppOnline = !!getGlobalXmppClient()?.checkOnline?.();
      const deduped = !!(lastSeen && now - lastSeen < 30_000);
      const appLoadTime = (window as any)._ethoraAppLoadTime || Date.now();
      const isWithinCatchupPeriod = Date.now() - appLoadTime < 2000;
      const isHistory = (isSystemMessage ? false : !!(payload as any).isHistory);

      const fgToastDecision = shouldShowForegroundPushToast({
        config,
        tabVisible: isTabVisible,
        alreadyInStore,
        deduped,
        isSystem: isSystemMessage,
        isHistory,
        isCatchup: isWithinCatchupPeriod,
      });
      const shouldForceSystemToast =
        isSystemMessage &&
        config?.messageNotifications?.enabled !== false &&
        isTabVisible;

      const message: IMessage = {
        id: messageId,
        user: {
          id: senderId || 'unknown',
          name: senderId || 'Unknown sender',
          userJID: senderId || null,
        },
        date: new Date().toISOString(),
        body,
        roomJid,
      };

      const roomName = isSystemMessage ? 'System' : roomJid || title;
      const senderName = isSystemMessage ? 'System' : senderId || 'Unknown sender';

      if (shouldForceSystemToast || fgToastDecision.show) {
        messageNotificationManager.showNotification(
          message,
          roomName,
          senderName,
          roomJid
        );
        if (config?.useStoreConsoleEnabled) {
          const reason = shouldForceSystemToast ? 'system_forced' : fgToastDecision.reason;
          console.log(`[NotifyPolicy] source=push action=show reason=${reason} msgId=${messageId} history=${isHistory} catchup=${isWithinCatchupPeriod}`);
        }
      } else if (config?.useStoreConsoleEnabled) {
        console.log(`[NotifyPolicy] source=push action=skip reason=${fgToastDecision.reason} msgId=${messageId} history=${isHistory} catchup=${isWithinCatchupPeriod}`);
      }

      recentPushToastsRef.current.set(dedupeKey, now);

      const osPushDecision = shouldShowForegroundOsPush({
        config,
        tabVisible: isTabVisible,
        xmppOnline,
      });

      if (osPushDecision.show) {
        const osTitle = isSystemMessage ? 'System' : title;
        void showOsNotification(osTitle, {
          body,
          icon: payload.notification?.image || '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'ethora-notification',
          data: {
            url,
            roomJid,
            senderId,
            messageId,
          },
        });
        if (config?.useStoreConsoleEnabled) {
          console.log(`[NotifyPolicy] source=push action=show_os reason=${osPushDecision.reason} msgId=${messageId}`);
        }
      } else if (config?.useStoreConsoleEnabled) {
        console.log(`[NotifyPolicy] source=push action=skip_os reason=${osPushDecision.reason} msgId=${messageId}`);
      }
    };

    if (!_foregroundUnsubscribe) {
      _foregroundUnsubscribe = listenForForegroundMessages((payload) => {
        _foregroundHandlers.forEach((cb) => cb(payload));
      }, options.firebaseConfig || config?.webPush?.firebaseConfig);
    }
    _foregroundHandlers.add(handler);

    return () => {
      _foregroundHandlers.delete(handler);
      if (_foregroundHandlers.size === 0 && _foregroundUnsubscribe) {
        _foregroundUnsubscribe();
        _foregroundUnsubscribe = null;
      }
    };
  }, [
    config,
    enabled,
    roomsMap,
    showOsNotification,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const onServiceWorkerMessage = (event: MessageEvent<any>) => {
      const data = event?.data;
      if (!data || data.type !== 'PUSH_FOREGROUND_BRIDGE' || !data.payload) return;
      _foregroundHandlers.forEach((cb) => cb(data.payload));
    };

    navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onServiceWorkerMessage);
    };
  }, [enabled]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Auto-run after the user logs in (unless softAsk is enabled)
  useEffect(() => {
    if (!userToken) return;             // not logged in yet
    if (softAsk) return;               // consumer controls timing
    if (hasRanRef.current) return;     // already ran for this session

    hasRanRef.current = true;
    runPushFlow();
  }, [userToken, softAsk, runPushFlow]);

  // Subscribe to all known rooms for push delivery
  useEffect(() => {
    if (!enabled) return;
    if (!fcmTokenReady) return;

    const roomJIDs = Object.keys(roomsMap || {}).filter(Boolean);
    if (!roomJIDs.length) return;
    const roomsHash = roomJIDs.sort().join('|');
    if (roomsHash === lastRoomsHashRef.current) return;
    lastRoomsHashRef.current = roomsHash;

    const client = getGlobalXmppClient();
    if (!client?.checkOnline?.()) return;
    pushSubscriptionService.subscribeToRooms(roomJIDs, client).catch((error) => {
      console.warn('[WebPush] Failed to subscribe to rooms:', error);
    });
  }, [enabled, roomsMap, fcmTokenReady]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Expose a manual trigger for soft-ask patterns
  const requestPermission = useCallback(async () => {
    hasRanRef.current = false;
    _subscriptionRegistered = false;
    await runPushFlow();
  }, [runPushFlow]);

  return { requestPermission };
};

export default useWebPush;
