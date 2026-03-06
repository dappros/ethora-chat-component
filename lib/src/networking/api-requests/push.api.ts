/**
 * push.api.ts
 * API methods for registering / unregistering a push notification subscription
 * with the Ethora backend so the server can target this browser for push events.
 */

import http from '../apiClient';
import { store } from '../../roomStore';

/**
 * Register a push notification/FCM registration token with the backend.
 * Sends a POST to /push/subscription/{userId} with the registration token.
 *
 * @param registrationToken – The FCM token obtained via Firebase Messaging.
 */
export async function registerPushToken(registrationToken: string): Promise<any> {
  const state = store.getState();
  const token = state.chatSettingStore.user.token || '';
  const appId = state.chatSettingStore.appId;

  if (!appId) {
    throw new Error('[PushNotifications] Cannot register push token: No app ID found in store.');
  }

  const payload = {
    registrationToken,
    deviceType: 'web',
  };

  console.log('[PushNotifications] Registering FCM token with backend:', {
    appId,
    token: registrationToken.substring(0, 10) + '...',
  });

  try {
    const response = await http.post(`/push/subscription/${appId}`, payload, {
      headers: {
        Authorization: token,
      },
    });
    return response?.data ?? null;
  } catch (err: any) {
    const status = err?.response?.status;
    console.warn(
      `[PushNotifications] Backend push registration failed (HTTP ${status ?? 'unknown'}). Push notifications may not work.`,
      err?.response?.data ?? err?.message
    );
    return null;
  }
}

/**
 * Unregister a push endpoint from the backend (e.g. on logout).
 *
 * @param registrationToken – The token to unregister.
 */
export async function unregisterPushToken(registrationToken: string): Promise<any> {
  const token = store.getState().chatSettingStore.user.token || '';

  console.log('[PushNotifications] Unregistering FCM token from backend:', registrationToken.substring(0, 10) + '...');

  try {
    const response = await http.delete('/users/endpoints', {
      headers: {
        Authorization: token,
      },
      data: { endpoint: registrationToken },
    });
    return response?.data ?? null;
  } catch (err: any) {
    console.warn('[PushNotifications] Failed to unregister push token:', err?.message);
    return null;
  }
}
