/**
 * push.api.ts
 * API methods for registering / unregistering a push notification subscription
 * with the Ethora backend so the server can target this browser for push events.
 */

import http from '../apiClient';
import { store } from '../../roomStore';
import { ethoraLogger } from '../../helpers/ethoraLogger';

type PushState = ReturnType<typeof store.getState>;

export const resolvePushLanguage = (state: PushState): string => {
  const settings = state.chatSettingStore;
  return String(
    settings.config?.translates?.readerLocale ||
      settings.config?.i18n?.locale ||
      settings.langSource ||
      ''
  ).trim();
};

const isUnknownLanguageError = (err: any): boolean =>
  err?.response?.status === 422 &&
  /language/i.test(String(err?.response?.data?.error ?? '')) &&
  /not allowed/i.test(String(err?.response?.data?.error ?? ''));

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
  const language = resolvePushLanguage(state);

  if (!appId) {
    throw new Error('[PushNotifications] Cannot register push token: No app ID found in store.');
  }

  const payload: { registrationToken: string; deviceType: 'web'; language?: string } = {
    registrationToken,
    deviceType: 'web',
    ...(language ? { language } : {}),
  };

  ethoraLogger.log('[PushNotifications] Registering FCM token with backend:', {
    appId,
    tokenLength: registrationToken.length,
    language,
  });

  const post = (body: typeof payload) =>
    http.post(`/v1/push/subscription/${appId}`, body, {
      headers: {
        Authorization: token,
      },
    });

  try {
    let response;
    try {
      response = await post(payload);
    } catch (err: any) {
      // A backend that predates `language` still delivers, in its default
      // language: worth more than no push at all.
      if (!(payload.language && isUnknownLanguageError(err))) throw err;
      const { language: _unsupported, ...withoutLanguage } = payload;
      response = await post(withoutLanguage);
    }
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
export async function unregisterPushToken(
  registrationToken: string,
  authToken?: string
): Promise<any> {
  const token = authToken || store.getState().chatSettingStore.user.token || '';

  ethoraLogger.log('[PushNotifications] Unregistering FCM token from backend', {
    tokenLength: registrationToken.length,
  });

  try {
    const response = await http.delete('/v1/users/endpoints', {
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
