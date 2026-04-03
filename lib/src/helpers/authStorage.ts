import { User } from '../types/types';
import { localStorageConstants } from './constants/LOCAL_STORAGE';

const USER_PAYLOAD_VERSION = 2;
const LOCAL_USER_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

interface StoredUserPayload {
  v: number;
  ts: number;
  appId?: string;
  user: User;
}

const getStorage = (
  storageType: 'localStorage' | 'sessionStorage'
): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window[storageType];
  } catch (error) {
    console.warn(`[AuthStorage] ${storageType} is unavailable`, error);
    return null;
  }
};

const isUserPayload = (value: unknown): value is StoredUserPayload => {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as StoredUserPayload).v === 'number' &&
      typeof (value as StoredUserPayload).ts === 'number' &&
      typeof (value as StoredUserPayload).user === 'object'
  );
};

const parseUserPayload = (
  rawUser: string | null
): StoredUserPayload | null => {
  if (!rawUser) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawUser) as unknown;
    if (isUserPayload(parsed)) {
      return parsed;
    }

    // Backward compatibility with old format where only user object was stored.
    return {
      v: 1,
      ts: Date.now(),
      appId: (parsed as User)?.appId,
      user: parsed as User,
    };
  } catch (error) {
    console.warn('[AuthStorage] Failed to parse stored user payload', error);
    return null;
  }
};

export const sanitizeUserForPersistentStorage = (
  user?: User | null
): User | null => {
  if (!user) {
    return null;
  }

  return {
    ...user,
    token: '',
    refreshToken: '',
    xmppPassword: '',
    resetPasswordToken: '',
    resetPasswordExpires: '',
  };
};

export const hasStoredSensitiveSession = (
  user?: Partial<User> | null
): boolean => {
  return Boolean(user?.token || user?.refreshToken || user?.xmppPassword);
};

export const persistUserSession = (user?: User | null) => {
  if (!user) {
    return;
  }

  const session = getStorage('localStorage');
  const payload: StoredUserPayload = {
    v: USER_PAYLOAD_VERSION,
    ts: Date.now(),
    appId: user.appId,
    user,
  };

  try {
    session?.setItem(
      localStorageConstants.ETHORA_USER_SESSION,
      JSON.stringify(payload)
    );
    // Keep auth session in sessionStorage only.
    // Remove any old localStorage payloads left from previous versions.
    clearLegacyLocalUserCache();
  } catch (error) {
    console.warn('[AuthStorage] Failed to persist user session', error);
  }
};

const isExpiredPayload = (
  payload: StoredUserPayload,
  ttlMs: number
): boolean => {
  if (!payload.ts || payload.ts <= 0) return false;
  return Date.now() - payload.ts > ttlMs;
};

export const getStoredUser = (expectedAppId?: string): User | null => {
  const session = getStorage('localStorage');
  const sessionPayload = parseUserPayload(
    session?.getItem(localStorageConstants.ETHORA_USER_SESSION) ?? null
  );

  const payload = sessionPayload;
  if (!payload?.user) {
    clearLegacyLocalUserCache();
    return null;
  }

  if (expectedAppId && payload.appId && payload.appId !== expectedAppId) {
    clearStoredUser();
    return null;
  }

  if (isExpiredPayload(payload, LOCAL_USER_MAX_AGE_MS)) {
    clearStoredUser();
    return null;
  }

  return payload.user;
};

export const clearStoredUser = () => {
  const local = getStorage('localStorage');
  const session = getStorage('sessionStorage');

  local?.removeItem(localStorageConstants.ETHORA_USER);
  local?.removeItem(localStorageConstants.ETHORA_USER_PAYLOAD_VERSION);
  session?.removeItem(localStorageConstants.ETHORA_USER_SESSION);
};

const clearLegacyLocalUserCache = () => {
  const local = getStorage('localStorage');
  local?.removeItem(localStorageConstants.ETHORA_USER);
  local?.removeItem(localStorageConstants.ETHORA_USER_PAYLOAD_VERSION);
};
