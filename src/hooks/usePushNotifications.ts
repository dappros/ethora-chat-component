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

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { AppDispatch, RootState } from '../roomStore';
import {
  initPushNotifications,
  listenForForegroundMessages,
  requestPendingPushClick,
} from '../utils/firebasePushNotifications';
import { registerPushToken, resolvePushLanguage } from '../networking/api-requests/push.api';
import { messageNotificationManager } from '../utils/messageNotificationManager';
import { IMessage } from '../types/models/message.model';
import { pushSubscriptionService } from '../utils/pushSubscriptionService';
import { getGlobalXmppClient } from '../utils/clientRegistry';
import { isLikelyMucJid } from '../helpers/isLikelyMucJid';
import { sweepPushSubscriptions } from './pushSubscriptionSweep';
import {
  setCurrentRoom,
  setPushSubscriptionStatus,
} from '../roomStore/roomsSlice';
import { isCallPush, parseCallPush } from '../helpers/callPush';
import {
  CallPushContext,
  CallPushOutcome,
  claimCallAction,
  clearCallPushSession,
  declineIncomingCallFromPush,
  flushPendingCallPush,
  handleCallPushFromWorker,
  raiseIncomingCallFromPush,
  unmarkCallRaisedFromPush,
} from '../helpers/incomingCallPush';
import { claimCallDecision } from '../helpers/callClaim';
import { callNotificationKey } from '../utils/callNotifications';
import { mirrorCallAuthToWorker } from '../utils/callAuthMirror';
import {
  announceCallClient,
  postToPushServiceWorker,
} from '../utils/pushServiceWorkerBridge';
import { store } from '../roomStore';
import {
  resolveNotificationRoomName,
  resolveNotificationSenderName,
} from '../utils/messageNotificationContent';
import { IConfig } from '../types/types';
import { ethoraLogger } from '../helpers/ethoraLogger';
import { setStoredFcmToken } from '../utils/pushStorage';
import { collectMessageIds, openRoomAtMessage } from '../helpers/openRoomAtMessage';
import { claimRoomForPush } from '../helpers/pushRoomHandoff';
import { normalizeRoomJidWithConference } from '../utils/runtimeHostConfig';
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
  /** Custom icon URL/path for browser OS notifications. */
  iconPath?: string;
  /** Custom badge URL/path for browser OS notifications. */
  badgePath?: string;
  /** Same-origin path a cold-start push tap opens (default: the origin root). */
  clickPath?: string;

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

  /**
   * Optional push click handler. When provided, has priority over
   * config.pushNotifications.onClick from Redux config.
   */
  onClick?: (params: {
    roomJID?: string;
    messageId?: string;
    url?: string;
    data?: Record<string, any>;
    notification?: { title?: string; body?: string };
    source?: 'service_worker' | 'foreground';
  }) => void | Promise<void>;
}

interface UsePushNotificationsResult {
  /** Manually trigger the permission + subscription flow (for soft-ask UIs). */
  requestPermission: () => Promise<void>;
}

const localPart = (jid: unknown): string =>
  String(jid ?? '')
    .split('@')[0]
    .trim()
    .toLowerCase();

// True when a push names no recipient, or names the logged-in user (or no one
// is identified yet). The push's `userJid` is the account it was sent to.
const isForUser = (recipient: unknown, currentUser: unknown): boolean => {
  const target = localPart(recipient);
  const me = localPart(currentUser);
  return !target || !me || me === target;
};

let _subscriptionRegistered = false; // module-level guard to prevent duplicate subscriptions
let _subscriptionRegistrationPromise: Promise<void> | null = null;
let _foregroundHandlers = new Set<(payload: any) => void>();
let _foregroundUnsubscribe: (() => void) | null = null;
// Mounted hook instances that can take a call over, so the worker is told this
// page cannot only when the last of them goes away.
let _callListeners = 0;

const usePushNotifications = (
  options: UsePushNotificationsOptions = {}
): UsePushNotificationsResult => {
  const { softAsk = false, enabled = false } = options;

  // Resolve VAPID key: hook option > env variable > empty string
  const vapidPublicKey =
    options.vapidPublicKey ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY) ||
    '';

  // Read the user token from Redux - we only run push setup once the user is logged in
  const userToken = useSelector((state: RootState) => state.chatSettingStore.user.token);
  const userXmppUsername = useSelector(
    (state: RootState) => state.chatSettingStore.user.xmppUsername
  );
  const roomsMap = useSelector((state: RootState) => state.rooms.rooms);
  const config = useSelector((state: RootState) => state.chatSettingStore.config as IConfig | undefined);
  const pushSubscriptionStatus = useSelector(
    (state: RootState) => state.rooms.pushSubscriptionStatus
  );
  const pushLanguage = useSelector(resolvePushLanguage);
  const dispatch = useDispatch<AppDispatch>();
  const registeredLanguageRef = useRef<string | null>(null);

  // Opened by a cold-start tap with the room in the url (`fromPush=1`): the
  // click is applied from the url below, so the worker's copy is dropped
  // instead of replayed. Read at first render, before the url is cleaned.
  const landedFromPushRef = useRef(
    typeof window !== 'undefined' &&
      new URL(window.location.href).searchParams.get('fromPush') === '1'
  );

  const userXmppUsernameRef = useRef(userXmppUsername);
  userXmppUsernameRef.current = userXmppUsername;

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
    (jid?: string): string =>
      normalizeRoomJidWithConference(jid, config?.xmppSettings?.conference),
    [config?.xmppSettings?.conference]
  );

  const fetchRecentHistory = useCallback(
    (roomJid: string) => {
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
          coalesceRoom: true,
        })
        .catch(() => {});
    },
    []
  );

  // The same dispatch / state / room-normalisation the call-push helpers use,
  // read through the store so a late timer or message never sees stale props.
  const reduxStore = useStore();
  const callPushCtx = useMemo<CallPushContext>(
    () => ({
      dispatch,
      getState: reduxStore.getState,
      normalizeRoomJid,
    }),
    [dispatch, reduxStore, normalizeRoomJid]
  );

  // Surface an incoming call that arrived via push (the XMPP `call-token` was
  // missed because the app was backgrounded or its socket was dead). With a
  // LiveKit token in the push the ring goes up through the guarded reducer and
  // Accept works offline (`answer` accepts it at once, for the notification's
  // Answer action); a late or duplicate push never disturbs a call already in
  // progress. Before the chat config (videoCalls) and the user are in Redux the
  // call is held, not dropped. Without a token we open the room and let the
  // reconnecting XMPP session deliver the real call-token.
  const handleIncomingCallPush = useCallback(
    (data: Record<string, any>, answer = false): CallPushOutcome => {
      const outcome = raiseIncomingCallFromPush(callPushCtx, data, { answer });
      if (outcome !== 'no-token') return outcome;

      const parsed = parseCallPush(data);
      const roomJid = normalizeRoomJid(parsed.roomRef || '');
      if (config?.videoCalls?.enabled !== true) return outcome;
      if (roomJid) {
        dispatch(setCurrentRoom({ roomJID: roomJid }));
      }
      ethoraLogger.log(
        '[PushNotifications] incoming call push without LiveKit token; awaiting XMPP call-token',
        { callId: parsed.callId, roomJid }
      );
      return outcome;
    },
    [callPushCtx, config?.videoCalls?.enabled, dispatch, normalizeRoomJid]
  );

  const handlePushClick = useCallback(
    async (payload: any, source: 'service_worker' | 'foreground') => {
      const data = payload?.data ?? payload?.payload?.data ?? {};
      const roomJidRaw = data.jid || data.roomJid || payload?.roomJid || '';
      const roomJid = normalizeRoomJid(roomJidRaw);
      const messageId =
        data.msgID || data.messageId || payload?.messageId || payload?.msgID;
      // A push can name the message by more than one id.
      const messageIds = collectMessageIds(
        data.msgID,
        data.messageId,
        data.stanzaId,
        data.xmppId,
        payload?.messageId,
        payload?.msgID
      );
      const url = data.url || payload?.url;
      const isCall = isCallPush(data);

      // A click kept by the service worker is not tied to a user. One made for
      // somebody else (the push names its recipient in `userJid`) must not be
      // replayed to whoever logs in next.
      if (!isCall && !isForUser(data.userJid, userXmppUsernameRef.current)) return;

      // Incoming call push: raise the ring screen instead of routing to chat
      // (and, for the Answer action, accept it). Both mounted hook instances
      // get this message; the guarded reducer makes the second a no-op. A
      // stale call push opens nothing ringing: a tap just opens the room.
      if (isCallPush(data)) {
        const tapped = parseCallPush(data);
        const callKey = callNotificationKey(tapped.callId, tapped.roomRef);
        const takesCalls = config?.videoCalls?.enabled === true;
        // The worker sent the click to every tab that could take it: only one
        // acts on it (two accepting would connect twice). The others end their
        // own ring when they hear the call was taken (callBroadcast).
        if (takesCalls) {
          const claim = claimCallAction('click', callKey);
          if ((typeof claim === 'boolean' ? claim : await claim) === false) return;
        }
        // The Answer action accepts: it needs the same per-call claim as the
        // Accept button on the ring screen, so a click on that button in
        // another tab at the same moment cannot connect the call twice. A tab
        // that loses does nothing; the winner announces the outcome and this
        // tab's ring ends. A plain tap only shows the ring and needs no claim.
        if (takesCalls && payload?.action === 'answer') {
          const decision = claimCallDecision(callKey);
          if ((typeof decision === 'boolean' ? decision : await decision) === false) {
            // Taken by the ring screen's Accept (or a Decline) elsewhere. Acked,
            // so the worker does not open or navigate a page for a call that
            // is already being handled.
            void postToPushServiceWorker({
              type: 'CALL_PUSH_ANSWER_ACK',
              callId: tapped.callId || '',
            });
            return;
          }
        }
        // The tap closed the worker's notification, so a ring that continues
        // here is no longer announced by it: the page may notify again if the
        // user leaves the tab mid-ring.
        unmarkCallRaisedFromPush(callKey);
        const outcome = handleIncomingCallPush(data, payload?.action === 'answer');
        // Tell the worker this page took the click. Without that ack (a page
        // that cannot take calls, or one that was not there to answer) the
        // worker brings the user to the chat page instead. A call held for the
        // config is not taken yet: the worker has nothing to wait for there,
        // the click was delivered to a page that is still loading.
        if (takesCalls && outcome !== 'held') {
          void postToPushServiceWorker({
            type: 'CALL_PUSH_ANSWER_ACK',
            callId: tapped.callId || '',
          });
        }
        if (outcome !== 'expired') return;
        const callRoom = normalizeRoomJid(parseCallPush(data).roomRef || '');
        if (callRoom) {
          openRoomAtMessage(dispatch, callRoom);
          fetchRecentHistory(callRoom);
        }
        return;
      }

      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          // Room and message only: the same tap reaches the page both as the
          // `fromPush` url and as the worker's pending click, and the two carry
          // different urls.
          const dedupeKey = `@ethora/chat-component:pushClick:${roomJid || ''}:${messageId || ''}${
            roomJid || messageId ? '' : `:${url || ''}`
          }`;
          const lastTs = Number(window.localStorage.getItem(dedupeKey) || '0');
          const now = Date.now();
          if (lastTs && now - lastTs < 5_000) return;
          window.localStorage.setItem(dedupeKey, String(now));
        }
      } catch (_) { /* empty */ }

      const customOnClick = options.onClick || config?.pushNotifications?.onClick;
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
        claimRoomForPush(roomJid);
        openRoomAtMessage(dispatch, roomJid, ...messageIds);
        fetchRecentHistory(roomJid);
      }
    },
    [config?.pushNotifications?.onClick, config?.videoCalls?.enabled, dispatch, fetchRecentHistory, normalizeRoomJid, options.onClick, handleIncomingCallPush]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  const runPushFlow = useCallback(async () => {
    if (!enabled) return;
    if (_subscriptionRegistered) {
      if (config?.useStoreConsoleEnabled) {
        ethoraLogger.log('[PushNotifications] Already subscribed this session, skipping.');
      }
      return;
    }

    if (_subscriptionRegistrationPromise) {
      await _subscriptionRegistrationPromise;
      return;
    }

    _subscriptionRegistrationPromise = (async () => {
      try {
        if (config?.useStoreConsoleEnabled) {
          ethoraLogger.log('[PushNotifications] Initializing FCM push notifications…');
        }
        const fcmToken = await initPushNotifications({
          vapidPublicKey,
          serviceWorkerPath: options.serviceWorkerPath,
          serviceWorkerScope: options.serviceWorkerScope,
          iconPath: options.iconPath || config?.pushNotifications?.iconPath,
          badgePath: options.badgePath || config?.pushNotifications?.badgePath,
          clickPath: options.clickPath || config?.pushNotifications?.clickPath,
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
        registeredLanguageRef.current = resolvePushLanguage(store.getState());

        _subscriptionRegistered = true;
        fcmTokenRef.current = fcmToken;
        setFcmTokenReady(fcmToken); // signal room-subscription effect
        setStoredFcmToken(fcmToken);

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
      } finally {
        _subscriptionRegistrationPromise = null;
      }
    })();

    await _subscriptionRegistrationPromise;
  }, [
    enabled,
    options.serviceWorkerPath,
    options.serviceWorkerScope,
    options.iconPath,
    options.badgePath,
    config?.pushNotifications?.iconPath,
    config?.pushNotifications?.badgePath,
    options.clickPath,
    config?.pushNotifications?.clickPath,
    config?.pushNotifications?.firebaseConfig,
    config?.useStoreConsoleEnabled,
    userXmppUsername,
    vapidPublicKey,
  ]);

  // Foreground push handler: config-driven push/in-app behavior
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const handler = (payload: any) => {
      const data = payload.data ?? {};

      // Incoming call push (foreground) → ring overlay, skip the message toast.
      if (isCallPush(data)) {
        handleIncomingCallPush(data);
        return;
      }

      if (String(data.type || '').toLowerCase() === 'reaction') {
        return;
      }

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
          name: '',
          userJID: senderId || null,
        },
        date: new Date().toISOString(),
        body,
        roomJid,
      };

      // The push only carries ids and backend boilerplate. Names come from
      // the store (same profile/room data the message bubbles use); the raw
      // `<appId>_<userId>` is never shown as a name.
      const pushRoom = roomJid ? store.getState().rooms.rooms[roomJid] : undefined;
      const resolvedSender = resolveNotificationSenderName(
        message,
        store.getState().rooms.usersSet,
        pushRoom
      );
      const resolvedRoom = resolveNotificationRoomName(roomJid, pushRoom, title);
      message.user.name = resolvedSender;

      const roomName = isSystemMessage ? 'System' : resolvedRoom || resolvedSender || 'Ethora';
      const senderName = isSystemMessage ? 'System' : resolvedSender || 'Ethora';

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
        fetchRecentHistory(roomJid);
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
  }, [config, enabled, roomsMap, normalizeRoomJid, fetchRecentHistory, handleIncomingCallPush]);

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
            action: data.action,
            messageId: data?.data?.messageId || data?.data?.msgID,
            url: data?.data?.url,
          },
          'service_worker'
        );
        return;
      }
      // The worker got a call push and asks whether this page rings it. Being
      // asked also tells the worker this page takes calls (it may have
      // restarted since the page announced itself).
      if (data.type === 'CALL_PUSH' && data.data) {
        if (_callListeners > 0) announceCallClient(true);
        handleCallPushFromWorker(callPushCtx, data.data);
        return;
      }
      // A restarted worker asks who can take a call over.
      if (data.type === 'CALL_CLIENT_PROBE') {
        if (_callListeners > 0) announceCallClient(true);
        return;
      }
      // Decline tapped on a call notification while a page was open.
      if (data.type === 'CALL_PUSH_DECLINE' && data.data) {
        declineIncomingCallFromPush(callPushCtx, data.data);
      }
    };

    navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onServiceWorkerMessage);
    };
  }, [enabled, handlePushClick, callPushCtx]);

  // Tell the worker this page can take an incoming call over (the listeners
  // above are attached and videoCalls is on). Answer and a tap on a call
  // notification are handed to such pages and wait for their ack; with none, the
  // worker brings the user to the chat page at once instead.
  const takesCallPushes = enabled && config?.videoCalls?.enabled === true;
  useEffect(() => {
    if (!takesCallPushes) return;
    _callListeners += 1;
    announceCallClient(true);
    return () => {
      _callListeners = Math.max(0, _callListeners - 1);
      if (_callListeners === 0) announceCallClient(false);
    };
  }, [takesCallPushes]);

  // Logging out (or switching account) ends everything the call push flow was
  // holding for the old session: a call held for the config, the tap the worker
  // keeps for the next page load, the call notifications on screen. Only a real
  // transition counts: a page that loads without a session yet must not drop a
  // tap that is waiting for it.
  const sessionRef = useRef({ token: userToken, user: userXmppUsername });
  useEffect(() => {
    const before = sessionRef.current;
    sessionRef.current = { token: userToken, user: userXmppUsername };
    const loggedOut = !!before.token && !userToken;
    const switched =
      !!before.token &&
      !!userToken &&
      !!before.user &&
      !!userXmppUsername &&
      before.user !== userXmppUsername;
    if (loggedOut || switched) {
      void clearCallPushSession(config?.pushNotifications?.serviceWorkerScope || '/');
    }
  }, [userToken, userXmppUsername, config?.pushNotifications?.serviceWorkerScope]);

  // A call push that came before the chat config (videoCalls) and the user were
  // in Redux was held; raise it as soon as both are there. The module-level
  // hold is taken once, so the two mounted hook instances cannot both raise it.
  const callPushReady = config?.videoCalls?.enabled === true && !!userToken;
  useEffect(() => {
    if (!enabled || !callPushReady) return;
    flushPendingCallPush(callPushCtx);
  }, [enabled, callPushReady, callPushCtx]);

  // Keep the worker's copy of the API token current, so a Decline tapped with
  // no page open can still reach the server (cleared on logout).
  useEffect(() => {
    if (!enabled) return;
    void mirrorCallAuthToWorker(
      config?.videoCalls?.enabled === true ? userToken : null
    );
  }, [enabled, userToken, config?.videoCalls?.enabled]);

  // Cold-start tap: the service worker could not message a page that was not
  // open yet, so it kept the click. Ask for it now that the message listener
  // above is attached (effects run in order) and the user is logged in; the
  // worker replies with a PUSH_NOTIFICATION_CLICK and forgets it, so repeat
  // asks are harmless. A page opened with `fromPush=1` already has the click
  // (see below) and only asks the worker to drop its copy.
  useEffect(() => {
    if (!enabled || !userToken) return;
    void requestPendingPushClick(undefined, {
      discard: landedFromPushRef.current,
    });
    // One drop is enough; later asks (effect re-runs) must not eat the click
    // of another cold start.
    landedFromPushRef.current = false;
  }, [enabled, userToken, handlePushClick]);

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
      setStoredFcmToken('');
      lastRoomsHashRef.current = '';
      isSyncingRef.current = false;
      _subscriptionRegistered = false;
      _subscriptionRegistrationPromise = null;
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

  useEffect(() => {
    if (!enabled) return;
    if (!userToken) return;
    if (softAsk) return;
    if (typeof window === 'undefined') return;
    if (typeof Notification === 'undefined') return;

    const tryReRegister = () => {
      if (_subscriptionRegistered) return;
      if (Notification.permission !== 'granted') return;
      void runPushFlow();
    };

    window.addEventListener('focus', tryReRegister);
    document.addEventListener('visibilitychange', tryReRegister);

    return () => {
      window.removeEventListener('focus', tryReRegister);
      document.removeEventListener('visibilitychange', tryReRegister);
    };
  }, [enabled, softAsk, userToken, runPushFlow]);

  useEffect(() => {
    if (!enabled || !userToken) return;
    const fcmToken = fcmTokenRef.current;
    if (!fcmToken || registeredLanguageRef.current === null) return;
    if (registeredLanguageRef.current === pushLanguage) return;
    registeredLanguageRef.current = pushLanguage;
    void registerPushToken(fcmToken);
  }, [enabled, userToken, pushLanguage, fcmTokenReady]);

  // Subscribe to all known rooms for push delivery
  useEffect(() => {
    if (!enabled) return;
    if (!fcmTokenReady) return;

    // .filter(Boolean) alone let non-JID keys through - root-slice fields
    // (usersSet, subscribedRooms, etc.) that leak into rooms.rooms from
    // corrupted/legacy persisted state - each one then hit
    // pushSubscriptionService.subscribeToRoom() as if it were a real room,
    // failing with errors like "Failed to subscribe to usersSet". Same class
    // of bug as the MAM-queue leak fixed in historyPreloadScheduler.ts /
    // updateMessagesTillLast.tsx.
    const roomJIDs = Object.keys(roomsMap || {})
      .filter(isLikelyMucJid)
      .sort();
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
          await sweepPushSubscriptions(roomJIDs, {
            getStatus: (jid) => pushSubscriptionStatus[jid],
            getRetryAt: (jid) => roomRetryAtRef.current.get(jid),
            isInFlight: (jid) => roomSubscribeInFlightRef.current.has(jid),
            markInFlight: (jid) => roomSubscribeInFlightRef.current.add(jid),
            clearInFlight: (jid) => roomSubscribeInFlightRef.current.delete(jid),
            setStatus: (jid, status) =>
              dispatch(
                setPushSubscriptionStatus({ jid, status: status as any })
              ),
            subscribe: (jid) =>
              pushSubscriptionService.subscribeToRoom(jid, client),
            onSubscribed: (jid) => {
              if (config?.useStoreConsoleEnabled) {
                ethoraLogger.log(`[PushNotifications] Subscribed to ${jid}`);
              }
            },
            onFailed: (jid, message) => {
              if (config?.useStoreConsoleEnabled) {
                console.warn(
                  `[PushNotifications] Failed to subscribe to ${jid}:`,
                  message
                );
              }
            },
          });
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
