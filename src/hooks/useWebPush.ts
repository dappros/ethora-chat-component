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
import { initPushNotifications } from '../utils/firebasePushManager';
import { registerPushToken } from '../networking/api-requests/push.api';

interface UseWebPushOptions {
  /**
   * URL-safe Base64 encoded VAPID public key.
   * Falls back to the VITE_VAPID_PUBLIC_KEY environment variable.
   */
  vapidPublicKey?: string;

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

const useWebPush = (options: UseWebPushOptions = {}): UseWebPushResult => {
  const { softAsk = false } = options;

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

  const hasRanRef = useRef(false);

  // ─────────────────────────────────────────────────────────────────────────────
  const runPushFlow = useCallback(async () => {
    try {
      if (_subscriptionRegistered) {
        console.log('[WebPush] Already subscribed this session, skipping.');
        return;
      }

      console.log('[WebPush] Initializing FCM push notifications…');
      const fcmToken = await initPushNotifications(vapidPublicKey);

      if (!fcmToken) {
        console.warn('[WebPush] Failed to obtain FCM token.');
        return;
      }

      // Step 4 – Backend registration
      console.log('[WebPush] Registering FCM token with Ethora backend (API)…');
      await registerPushToken(fcmToken);

      _subscriptionRegistered = true;

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
  }, [vapidPublicKey, userXmppUsername]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Auto-run after the user logs in (unless softAsk is enabled)
  useEffect(() => {
    if (!userToken) return;             // not logged in yet
    if (softAsk) return;               // consumer controls timing
    if (hasRanRef.current) return;     // already ran for this session

    hasRanRef.current = true;
    runPushFlow();
  }, [userToken, softAsk, runPushFlow]);

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
