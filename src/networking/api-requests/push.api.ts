/**
 * push.api.ts
 * API methods for registering / unregistering a Web Push (VAPID) subscription
 * with the Ethora backend so the server can target this browser for push events.
 */

import http from '../apiClient';
import { store } from '../../roomStore';

/**
 * Register a Web Push/FCM registration token with the backend.
 * Sends a POST to /push/subscription/{userId} with the registration token.
 *
 * @param registrationToken – The FCM token obtained via Firebase Messaging.
 */
export async function registerPushToken(registrationToken: string): Promise<any> {
  const state = store.getState();
  const token = state.chatSettingStore.user.token || '';
  const userId = state.chatSettingStore.user._id;

  if (!userId) {
    throw new Error('[WebPush] Cannot register push token: No user ID found in store.');
  }

  const payload = {
    registrationToken,
    deviceType: 'web',
  };

  console.log('[WebPush] Registering FCM token with backend:', {
    userId,
    token: registrationToken.substring(0, 10) + '...',
  });

  const response = await http.post(`/push/subscription/${userId}`, payload, {
    headers: {
      Authorization: token,
    },
  });

  return response.data;
}

/**
 * Unregister a push endpoint from the backend (e.g. on logout).
 *
 * @param registrationToken – The token to unregister.
 */
export async function unregisterPushToken(registrationToken: string): Promise<any> {
  const token = store.getState().chatSettingStore.user.token || '';

  console.log('[WebPush] Unregistering FCM token from backend:', registrationToken.substring(0, 10) + '...');

  const response = await http.delete('/users/endpoints', {
    headers: {
      Authorization: token,
    },
    data: { endpoint: registrationToken }, // Keep endpoint key for compatibility or update BE accordingly
  });

  return response.data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
