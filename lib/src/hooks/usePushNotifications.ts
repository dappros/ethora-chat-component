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
  setCurrentRoom,
  setPushSubscriptionStatus,
} from '../roomStore/roomsSlice';
import { IConfig } from '../types/types';
import { ethoraLogger } from '../helpers/ethoraLogger';
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
  const roomSubscribeInFlightRef = useRef<Set<string>>(new Set());
  const roomRetryAtRef = useRef<Map<string, number>>(new Map());
  const roomProcessRunningRef = useRef(false);
  const isSyncingRef = useRef(false);
  const lastXmppUsernameRef = useRef<string>('');
  const recentHistoryFetchRef = useRef<Map<string, number>>(new Map());

  const normalizeRoomJid = useCallback(
    (jid?: string): string => {
      if (!jid) return '';
      if (jid.includes('@')) return jid;
      const conference =
        config?.xmppSettings?.conference || 'conference.xmpp.ethoradev.com';
      return `${jid}@${conference}`;
    },
    [config?.xmppSettings?.conference]
  );

  const scrollToMessage = useCallback((messageId?: string) => {
    if (!messageId || typeof document === 'undefined') return;
    const messageElement = document.querySelector(
      `[data-message-id="${messageId}"]`
    );
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      messageElement.classList.add('message-highlight');
      setTimeout(() => messageElement.classList.remove('message-highlight'), 2000);
    }
  }, []);

  const fetchRecentHistory = useCallback(
    (roomJid: string, messageId?: string) => {
      if (!roomJid) return;
      const now = Date.now();
      const lastFetch = recentHistoryFetchRef.current.get(roomJid) || 0;
      if (now - lastFetch < 1500) return;
      recentHistoryFetchRef.current.set(roomJid, now);

      const client = getGlobalXmppClient();
      if (!client?.checkOnline?.()) return;

      client.prioritizeRoomPresence(roomJid).catch(() => {});
      client
        .getHistoryStanza(roomJid, 30, undefined, undefined, {
          source: 'active',
        })
        .catch(() => {})
        .finally(() => {
          if (messageId) {
            setTimeout(() => scrollToMessage(messageId), 200);
          }
        });
    },
    [scrollToMessage]
  );

  const handlePushClick = useCallback(
    async (payload: any, source: 'service_worker' | 'foreground') => {
      const data = payload?.data ?? payload?.payload?.data ?? {};
      const roomJidRaw = data.jid || data.roomJid || payload?.roomJid || '';
      const roomJid = normalizeRoomJid(roomJidRaw);
      const messageId =
        data.msgID || data.messageId || payload?.messageId || payload?.msgID;
      const url = data.url || payload?.url;

      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const dedupeKey = `@ethora/chat-component:pushClick:${roomJid || ''}:${messageId || ''}:${url || ''}`;
          const lastTs = Number(window.localStorage.getItem(dedupeKey) || '0');
          const now = Date.now();
          if (lastTs && now - lastTs < 5_000) return;
          window.localStorage.setItem(dedupeKey, String(now));
        }
      } catch (_) { /* empty */ }

      const customOnClick = config?.pushNotifications?.onClick;
      if (customOnClick) {
        try {
          await customOnClick({
            roomJID: roomJid,
            messageId: messageId ? String(messageId) : undefined,
            url,
            data,
            notification: payload?.notification,
            source,
          });
        } catch (error) {
          console.error('[PushNotifications] Error in onClick handler:', error);
        }
        return;
      }

      if (roomJid) {
        dispatch(setCurrentRoom({ roomJID: roomJid }));
        fetchRecentHistory(roomJid, messageId ? String(messageId) : undefined);
      }
    },
    [config?.pushNotifications?.onClick, dispatch, fetchRecentHistory, normalizeRoomJid]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  const runPushFlow = useCallback(async () => {
    try {
      if (!enabled) return;
      if (_subscriptionRegistered) {
        if (config?.useStoreConsoleEnabled) {
          ethoraLogger.log('[PushNotifications] Already subscribed this session, skipping.');
        }
        return;
      }

      if (config?.useStoreConsoleEnabled) {
        ethoraLogger.log('[PushNotifications] Initializing FCM push notifications…');
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
        ethoraLogger.log('[PushNotifications] Registering FCM token with Ethora backend (API)…');
      }
      await registerPushToken(fcmToken);

      _subscriptionRegistered = true;
      fcmTokenRef.current = fcmToken;
      setFcmTokenReady(fcmToken); // signal room-subscription effect

      // Log: subscribed via API
      if (config?.useStoreConsoleEnabled) {
        ethoraLogger.log(
          '%c[PushNotifications] ✅ User subscribed via API',
          'color: #22c55e; font-weight: bold'
        );
      }

      // Log: XMPP session linked (informational)
      if (userXmppUsername) {
        if (config?.useStoreConsoleEnabled) {
          ethoraLogger.log(
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
      const roomJid = normalizeRoomJid(data.jid || '');
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
          name: senderId || 'Ethora',
          userJID: senderId || null,
        },
        date: new Date().toISOString(),
        body,
        roomJid,
      };

      const roomName = isSystemMessage ? 'System' : roomJid || title;
      const senderName = isSystemMessage ? 'System' : senderId || 'Ethora';

      if (shouldForceSystemToast || fgToastDecision.show) {
        messageNotificationManager.showNotification(
          message,
          roomName,
          senderName,
          roomJid
        );
      }

      recentPushToastsRef.current.set(dedupeKey, now);

      if (roomJid && !alreadyInStore) {
        fetchRecentHistory(roomJid, existingMessageId);
      }

      // Browser notifications are now handled by MessageNotificationContext
      if (config?.useStoreConsoleEnabled) {
        const osPushDecision = shouldShowForegroundOsPush({ config, tabVisible: isTabVisible });
        ethoraLogger.log(`[NotifyPolicy] source=push action=check_os_delegated show=${osPushDecision.show} reason=${osPushDecision.reason} msgId=${messageId}`);
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
  }, [config, enabled, roomsMap, normalizeRoomJid, fetchRecentHistory]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const onServiceWorkerMessage = (event: MessageEvent<any>) => {
      const data = event?.data;
      if (!data) return;
      if (data.type === 'PUSH_FOREGROUND_BRIDGE' && data.payload) {
        _foregroundHandlers.forEach((cb) => cb(data.payload));
        return;
      }
      if (data.type === 'PUSH_NOTIFICATION_CLICK') {
        handlePushClick(
          {
            data: data.data || {},
            notification: data.notification || {},
            messageId: data?.data?.messageId || data?.data?.msgID,
            url: data?.data?.url,
          },
          'service_worker'
        );
      }
    };

    navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onServiceWorkerMessage);
    };
  }, [enabled, handlePushClick]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get('fromPush') !== '1') return;

    const chatId = currentUrl.searchParams.get('chatId') || '';
    const messageId =
      currentUrl.searchParams.get('messageId') ||
      currentUrl.searchParams.get('msgId') ||
      '';

    handlePushClick(
      {
        data: {
          jid: chatId,
          msgID: messageId,
          messageId,
          url: currentUrl.toString(),
        },
        notification: {},
      },
      'service_worker'
    );

    try {
      currentUrl.searchParams.delete('fromPush');
      window.history.replaceState({}, document.title, currentUrl.toString());
    } catch (_) { /* empty */ }
  }, [enabled, handlePushClick]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Auto-run after the user logs in (unless softAsk is enabled)
  useEffect(() => {
    if (!userToken || lastXmppUsernameRef.current !== userXmppUsername) {
      hasRanRef.current = false;
      fcmTokenRef.current = null;
      setFcmTokenReady(null);
      lastRoomsHashRef.current = '';
      isSyncingRef.current = false;
      _subscriptionRegistered = false;
    }

    lastXmppUsernameRef.current = userXmppUsername || '';
  }, [userToken, userXmppUsername]);

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

    const roomJIDs = Object.keys(roomsMap || {}).filter(Boolean).sort();
    const roomJIDsHash = roomJIDs
      .map((jid) => `${jid}:${pushSubscriptionStatus[jid] || 'idle'}`)
      .join(',');
    
    // Only proceed if the set of rooms has changed or we haven't run yet
    if (roomJIDsHash === lastRoomsHashRef.current) {
      return;
    }
    
    const client = getGlobalXmppClient();
    if (!client?.checkOnline?.()) {
      return;
    }

    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    lastRoomsHashRef.current = roomJIDsHash;

    const processSubscriptions = async () => {
      try {
        if (roomProcessRunningRef.current) return;
      roomProcessRunningRef.current = true;
      try {
      for (const roomJID of roomJIDs) {
          const currentStatus = pushSubscriptionStatus[roomJID];
          
          if (
            currentStatus === 'subscribed' ||
            currentStatus === 'pending' ||
            currentStatus === 'blocked' ||
            currentStatus === 'error'
          ) {
            continue;
          }

        const retryAt = roomRetryAtRef.current.get(roomJID);
        if (retryAt && retryAt > Date.now()) {
          continue;
        }

        if (roomSubscribeInFlightRef.current.has(roomJID)) {
          continue;
        }

        dispatch(setPushSubscriptionStatus({ jid: roomJID, status: 'pending' }));
        
        try {
          const result = await pushSubscriptionService.subscribeToRoom(roomJID, client);
          if (result.ok === true) {
            dispatch(setPushSubscriptionStatus({ jid: roomJID, status: 'subscribed' }));
            if (config?.useStoreConsoleEnabled) {
              ethoraLogger.log(`[PushNotifications] ✅ Subscribed to ${roomJID}`);
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
      } finally {
        isSyncingRef.current = false;
      }
      } finally {
        roomProcessRunningRef.current = false;
      }
    };

    void processSubscriptions();
  }, [enabled, roomsMap, fcmTokenReady, dispatch, pushSubscriptionStatus]);

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
