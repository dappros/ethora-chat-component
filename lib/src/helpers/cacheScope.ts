import { IConfig } from '../types/types';
import { sha256 } from 'js-sha256';
import { localStorageConstants } from './constants/LOCAL_STORAGE';

const CACHE_SCOPE_VERSION = 'v3';

const PERSIST_REDUX_KEYS = [
  'persist:root',
  'persist:chatSettingStore',
  'persist:roomMessages',
  'persist:roomHeapSlice',
] as const;

const normalize = (value?: string | null): string =>
  (value || '').toString().trim().toLowerCase();

export const buildCacheScope = (config?: IConfig): string => {
  const parts = [
    CACHE_SCOPE_VERSION,
    normalize(config?.appId),
    normalize(config?.baseUrl),
    normalize(config?.xmppSettings?.host),
    normalize(config?.xmppSettings?.devServer),
    normalize(config?.xmppSettings?.conference),
  ];

  return sha256(parts.join('|'));
};

const removeFromStorage = (store: Storage | null, key: string): void => {
  if (!store) return;
  try {
    store.removeItem(key);
  } catch (error) {
    console.warn(`[CacheScope] Failed to remove key ${key}`, error);
  }
};

interface ClearScopedChatCacheOptions {
  /**
   * Keep the chat id a QR code / shared link just parked.
   *
   * That id is not cached data from a previous session, it is the room the
   * user is arriving at RIGHT NOW. Wiping it on a first-run reset (which is
   * exactly when someone opens a link on a fresh browser) dropped the
   * destination on the floor: the selection was cleared, and the first room
   * that happened to arrive over XMPP was opened instead. A genuine tenant
   * switch still drops it - a bare chat id means nothing in another tenant.
   */
  keepPendingChatId?: boolean;
}

export const clearScopedChatCache = (
  options?: ClearScopedChatCacheOptions
): void => {
  if (typeof window === 'undefined') return;

  const local = window.localStorage;
  const session = window.sessionStorage;

  PERSIST_REDUX_KEYS.forEach((key) => {
    removeFromStorage(local, key);
    removeFromStorage(session, key);
  });

  if (!options?.keepPendingChatId) {
    removeFromStorage(local, localStorageConstants.ETHORA_QR_CHAT_ID);
  }
  removeFromStorage(local, localStorageConstants.ETHORA_USER);
  removeFromStorage(local, localStorageConstants.ETHORA_USER_SESSION);
  removeFromStorage(local, localStorageConstants.ETHORA_USER_PAYLOAD_VERSION);
  removeFromStorage(local, localStorageConstants.ETHORA_CACHE_SCOPE);
  removeFromStorage(session, localStorageConstants.ETHORA_USER);
  removeFromStorage(session, localStorageConstants.ETHORA_USER_SESSION);
};

const hasLegacyPersistedPayload = (previousScope: string | null): boolean => {
  if (typeof window === 'undefined') return false;
  if (previousScope) return false;

  const local = window.localStorage;
  const session = window.sessionStorage;

  return PERSIST_REDUX_KEYS.some((key) => {
    try {
      return local.getItem(key) !== null || session.getItem(key) !== null;
    } catch {
      return false;
    }
  });
};

export const ensureScopedChatCache = (
  config?: IConfig
): { changed: boolean; scope: string; previousScope: string | null } => {
  if (typeof window === 'undefined') {
    return { changed: false, scope: '', previousScope: null };
  }

  const scope = buildCacheScope(config);
  const local = window.localStorage;

  let previousScope: string | null = null;
  try {
    previousScope = local.getItem(localStorageConstants.ETHORA_CACHE_SCOPE);
  } catch (error) {
    console.warn('[CacheScope] Failed to read cache scope', error);
  }

  const hasLegacy = hasLegacyPersistedPayload(previousScope);

  if (previousScope === scope && !hasLegacy) {
    return { changed: false, scope, previousScope };
  }

  const shouldReset = previousScope !== null || hasLegacy;

  if (shouldReset) {
    // previousScope === null means this browser has never recorded a scope:
    // a first run, or a legacy payload from before scoping existed. That is
    // not a tenant switch, so a pending deep-link chat id must survive it.
    clearScopedChatCache({ keepPendingChatId: previousScope === null });
  }

  try {
    local.setItem(localStorageConstants.ETHORA_CACHE_SCOPE, scope);
  } catch (error) {
    console.warn('[CacheScope] Failed to persist cache scope', error);
  }

  return { changed: shouldReset, scope, previousScope };
};
