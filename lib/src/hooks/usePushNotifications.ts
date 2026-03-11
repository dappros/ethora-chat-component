/**
 * usePushNotifications.ts
 * React hook that orchestrates the full push notification subscription lifecycle:
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
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../roomStore';
import {
  initPushNotifications,
  listenForForegroundMessages,
} from '../utils/firebasePushNotifications';
import { registerPushToken } from '../networking/api-requests/push.api';
import { messageNotificationManager } from '../utils/messageNotificationManager';
import { IMessage } from '../types/models/message.model';
import { pushSubscriptionService } from '../utils/pushSubscriptionService';
import { getGlobalXmppClient } from '../utils/clientRegistry';
import {
  setPushSubscriptionStatus,
} from '../roomStore/roomsSlice';
import { IConfig } from '../types/types';
import {
  buildNotificationUrl,
  hasMessageInRooms,
  isSystemPayload,
  shouldShowForegroundOsPush,
  shouldShowForegroundPushToast,
} from '../utils/notificationPolicy';

interface UsePushNotificationsOptions {
  /** Enable or disable the push notification flow. Default: true */
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

interface UsePushNotificationsResult {
  /** Manually trigger the permission + subscription flow (for soft-ask UIs). */
  requestPermission: () => Promise<void>;
}

let _subscriptionRegistered = false; // module-level guard to prevent duplicate subscriptions
let _foregroundHandlers = new Set<(payload: any) => void>();
let _foregroundUnsubscribe: (() => void) | null = null;

const usePushNotifications = (
  options: UsePushNotificationsOptions = {}
): UsePushNotificationsResult => {
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
  const pushSubscriptionStatus = useSelector(
    (state: RootState) => state.rooms.pushSubscriptionStatus
  );
  const dispatch = useDispatch<AppDispatch>();

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
        if (config?.useStoreConsoleEnabled) {
          console.log('[PushNotifications] Already subscribed this session, skipping.');
        }
        return;
      }

      if (config?.useStoreConsoleEnabled) {
        console.log('[PushNotifications] Initializing FCM push notifications…');
      }
      const fcmToken = await initPushNotifications({
        vapidPublicKey,
        serviceWorkerPath: options.serviceWorkerPath,
        serviceWorkerScope: options.serviceWorkerScope,
        firebaseConfig: options.firebaseConfig || config?.pushNotifications?.firebaseConfig,
        debug: config?.useStoreConsoleEnabled,
      });

      if (!fcmToken) {
        if (config?.useStoreConsoleEnabled) {
          console.warn('[PushNotifications] Failed to obtain FCM token.');
        }
        return;
      }

      // Step 4 – Backend registration
      if (config?.useStoreConsoleEnabled) {
        console.log('[PushNotifications] Registering FCM token with Ethora backend (API)…');
      }
      await registerPushToken(fcmToken);

      _subscriptionRegistered = true;
      fcmTokenRef.current = fcmToken;
      setFcmTokenReady(fcmToken); // signal room-subscription effect

      // Log: subscribed via API
      if (config?.useStoreConsoleEnabled) {
        console.log(
          `%c[PushNotifications] ✅ User subscribed via API – Token: ${fcmToken.substring(0, 15)}...`,
          'color: #22c55e; font-weight: bold'
        );
      }

      // Log: XMPP session linked (informational)
      if (userXmppUsername) {
        if (config?.useStoreConsoleEnabled) {
          console.log(
            `%c[PushNotifications] ✅ Device linked to XMPP – JID: ${userXmppUsername}`,
            'color: #3b82f6; font-weight: bold'
          );
        }
      }
    } catch (error) {
      if (config?.useStoreConsoleEnabled) {
        console.error('[PushNotifications] Registration error:', error);
      }
    }
  }, [
    enabled,
    options.serviceWorkerPath,
    options.serviceWorkerScope,
    userXmppUsername,
    vapidPublicKey,
  ]);

  // Foreground push handler: config-driven push/in-app behavior
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const handler = (payload: any) => {
      const data = payload.data ?? {};
      const title = payload.notification?.title || data.title || 'New message';
      const body = payload.notification?.body || data.body || 'You have a new message.';
      const roomJid = data.jid || '';
      const senderId = data.userJid || '';
      const messageId = payload.messageId || data.msgID || String(Date.now());
      const isSystemMessage = isSystemPayload(payload);
      const isTabVisible = document.visibilityState === 'visible';

      const now = Date.now();
      const dedupeKey = payload.messageId || data.msgID || `${roomJid}|${senderId}|${title}|${body}`;
      const lastSeen = recentPushToastsRef.current.get(dedupeKey);
      const existingMessageId = payload.messageId || data.msgID;
      const alreadyInStore = hasMessageInRooms(roomsMap, existingMessageId);
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
        config?.inAppNotifications?.enabled === true &&
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
      }

      recentPushToastsRef.current.set(dedupeKey, now);

      // Browser notifications are now handled by MessageNotificationContext
      if (config?.useStoreConsoleEnabled) {
        const osPushDecision = shouldShowForegroundOsPush({ config, tabVisible: isTabVisible });
        console.log(`[NotifyPolicy] source=push action=check_os_delegated show=${osPushDecision.show} reason=${osPushDecision.reason} msgId=${messageId}`);
      }
    };

    if (!_foregroundUnsubscribe) {
      _foregroundUnsubscribe = listenForForegroundMessages((payload) => {
        _foregroundHandlers.forEach((cb) => cb(payload));
      }, options.firebaseConfig || config?.pushNotifications?.firebaseConfig);
    }
    _foregroundHandlers.add(handler);

    return () => {
      _foregroundHandlers.delete(handler);
      if (_foregroundHandlers.size === 0 && _foregroundUnsubscribe) {
        _foregroundUnsubscribe();
        _foregroundUnsubscribe = null;
      }
    };
  }, [config, enabled, roomsMap]);

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

    const client = getGlobalXmppClient();
    if (!client?.checkOnline?.()) return;

    const processSubscriptions = async () => {
      for (const roomJID of roomJIDs) {
        const currentStatus = pushSubscriptionStatus[roomJID];
        
        if (currentStatus === 'subscribed' || currentStatus === 'pending' || currentStatus === 'blocked') {
          continue;
        }

        dispatch(setPushSubscriptionStatus({ jid: roomJID, status: 'pending' }));
        
        try {
          const result = await pushSubscriptionService.subscribeToRoom(roomJID, client);
          if (result.ok === true) {
            dispatch(setPushSubscriptionStatus({ jid: roomJID, status: 'subscribed' }));
            if (config?.useStoreConsoleEnabled) {
              console.log(`[PushNotifications] ✅ Subscribed to ${roomJID}`);
            }
          } else {
            const status = result.reason === 'forbidden' ? 'blocked' : 'error';
            dispatch(setPushSubscriptionStatus({ jid: roomJID, status }));
            if (config?.useStoreConsoleEnabled) {
              console.warn(`[PushNotifications] ❌ Failed to subscribe to ${roomJID}:`, result.message);
            }
          }
        } catch (error) {
          dispatch(setPushSubscriptionStatus({ jid: roomJID, status: 'error' }));
          if (config?.useStoreConsoleEnabled) {
            console.error(`[PushNotifications] Error subscribing to ${roomJID}:`, error);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };

    void processSubscriptions();
  }, [enabled, roomsMap, fcmTokenReady, pushSubscriptionStatus, dispatch]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Expose a manual trigger for soft-ask patterns
  const requestPermission = useCallback(async () => {
    hasRanRef.current = false;
    _subscriptionRegistered = false;
    await runPushFlow();
  }, [runPushFlow]);

  return { requestPermission };
};

export default usePushNotifications;
