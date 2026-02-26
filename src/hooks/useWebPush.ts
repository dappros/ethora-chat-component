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

import { useEffect, useRef, useCallback } from 'react';
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
import { IRoom } from '../types/types';

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
let _foregroundListenerCount = 0;
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

  const hasRanRef = useRef(false);
  const fcmTokenRef = useRef<string | null>(null);
  const recentPushToastsRef = useRef<Map<string, number>>(new Map());

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

  // Foreground push: show toast + OS notification when app is open
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
      const url = data.url || '/';

      const now = Date.now();
      const dedupeKey =
        payload.messageId ||
        data.msgID ||
        `${roomJid}|${senderId}|${title}|${body}`;
      const lastSeen = recentPushToastsRef.current.get(dedupeKey);
      const existingMessageId = payload.messageId || data.msgID;
      const alreadyInStore = existingMessageId
        ? (Object.values(roomsMap || {}) as IRoom[]).some((room) =>
            room?.messages?.some(
              (msg) =>
                msg.id === existingMessageId || msg.xmppId === existingMessageId
            )
          )
        : false;
      const xmppOnline = !!getGlobalXmppClient()?.checkOnline?.();
      const skipToast =
        (lastSeen && now - lastSeen < 30_000) || alreadyInStore || xmppOnline;

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

      const roomName = roomJid || title;
      const senderName = senderId || 'Unknown sender';

      if (!skipToast) {
        messageNotificationManager.showNotification(
          message,
          roomName,
          senderName,
          roomJid
        );
      }

      recentPushToastsRef.current.set(dedupeKey, now);

      if (!payload.notification) {
        void showOsNotification(title, {
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
      }
    };

    if (!_foregroundUnsubscribe) {
      _foregroundUnsubscribe = listenForForegroundMessages(handler);
    }
    _foregroundListenerCount += 1;

    return () => {
      _foregroundListenerCount -= 1;
      if (_foregroundListenerCount <= 0 && _foregroundUnsubscribe) {
        _foregroundUnsubscribe();
        _foregroundUnsubscribe = null;
        _foregroundListenerCount = 0;
      }
    };
  }, [enabled, roomsMap, showOsNotification]);

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
    if (!fcmTokenRef.current) return;

    const roomJIDs = Object.keys(roomsMap || {}).filter(Boolean);
    if (!roomJIDs.length) return;

    const client = getGlobalXmppClient();
    pushSubscriptionService.subscribeToRooms(roomJIDs, client).catch((error) => {
      console.warn('[WebPush] Failed to subscribe to rooms:', error);
    });
  }, [enabled, roomsMap]);

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
