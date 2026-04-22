export const FCM_TOKEN_STORAGE_KEY = '@ethora/chat-component:fcmToken';

export const getStoredFcmToken = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.localStorage.getItem(FCM_TOKEN_STORAGE_KEY) || '');
  } catch {
    return '';
  }
};

export const setStoredFcmToken = (token: string): void => {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
    }
  } catch {
  }
};

