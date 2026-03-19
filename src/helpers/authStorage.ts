import { User } from '../types/types';
import { localStorageConstants } from './constants/LOCAL_STORAGE';

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

const parseUser = (rawUser: string | null): User | null => {
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as User;
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

  const local = getStorage('localStorage');
  const session = getStorage('sessionStorage');
  const sanitizedUser = sanitizeUserForPersistentStorage(user);

  try {
    session?.setItem(
      localStorageConstants.ETHORA_USER_SESSION,
      JSON.stringify(user)
    );
    if (sanitizedUser) {
      local?.setItem(
        localStorageConstants.ETHORA_USER,
        JSON.stringify(sanitizedUser)
      );
    }
  } catch (error) {
    console.warn('[AuthStorage] Failed to persist user session', error);
  }
};

export const getStoredUser = (): User | null => {
  const session = getStorage('sessionStorage');
  const local = getStorage('localStorage');

  return (
    parseUser(session?.getItem(localStorageConstants.ETHORA_USER_SESSION) ?? null) ??
    parseUser(local?.getItem(localStorageConstants.ETHORA_USER) ?? null)
  );
};

export const clearStoredUser = () => {
  const local = getStorage('localStorage');
  const session = getStorage('sessionStorage');

  local?.removeItem(localStorageConstants.ETHORA_USER);
  session?.removeItem(localStorageConstants.ETHORA_USER_SESSION);
};
