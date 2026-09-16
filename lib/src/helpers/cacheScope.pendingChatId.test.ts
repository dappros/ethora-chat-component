import { describe, expect, it, beforeEach } from 'vitest';
import { clearScopedChatCache, ensureScopedChatCache } from './cacheScope';
import { localStorageConstants } from './constants/LOCAL_STORAGE';

const QR_KEY = localStorageConstants.ETHORA_QR_CHAT_ID;
const SCOPE_KEY = localStorageConstants.ETHORA_CACHE_SCOPE;

const CONFIG_A = {
  appId: 'app-a',
  baseUrl: 'https://api.a.example.com',
  xmppSettings: { conference: 'conference.a.example.com' },
} as any;
const CONFIG_B = {
  appId: 'app-b',
  baseUrl: 'https://api.b.example.com',
  xmppSettings: { conference: 'conference.b.example.com' },
} as any;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('clearScopedChatCache', () => {
  it('drops a parked chat id by default', () => {
    localStorage.setItem(QR_KEY, 'app1_room1');
    clearScopedChatCache();
    expect(localStorage.getItem(QR_KEY)).toBeNull();
  });

  it('can keep a parked chat id', () => {
    localStorage.setItem(QR_KEY, 'app1_room1');
    clearScopedChatCache({ keepPendingChatId: true });
    expect(localStorage.getItem(QR_KEY)).toBe('app1_room1');
  });

  it('still clears the persisted redux payload when keeping the chat id', () => {
    localStorage.setItem('persist:root', '{}');
    localStorage.setItem(QR_KEY, 'app1_room1');
    clearScopedChatCache({ keepPendingChatId: true });
    expect(localStorage.getItem('persist:root')).toBeNull();
  });
});

describe('ensureScopedChatCache and a pending deep link', () => {
  it('keeps the parked id through a first-run / legacy reset', () => {
    // Opening a QR link on a browser that has a pre-scoping payload but no
    // recorded scope. Wiping the id here dropped the destination the user
    // had just arrived at, and the session opened some other room instead.
    localStorage.setItem('persist:root', '{}');
    localStorage.setItem(QR_KEY, 'app1_room1');

    const result = ensureScopedChatCache(CONFIG_A);

    expect(result.changed).toBe(true);
    expect(localStorage.getItem(QR_KEY)).toBe('app1_room1');
  });

  it('drops the parked id when the tenant actually changes', () => {
    // A bare chat id means nothing in a different tenant.
    ensureScopedChatCache(CONFIG_A);
    localStorage.setItem(QR_KEY, 'app1_room1');

    ensureScopedChatCache(CONFIG_B);

    expect(localStorage.getItem(QR_KEY)).toBeNull();
  });

  it('leaves everything alone when the scope is unchanged', () => {
    ensureScopedChatCache(CONFIG_A);
    localStorage.setItem(QR_KEY, 'app1_room1');

    const result = ensureScopedChatCache(CONFIG_A);

    expect(result.changed).toBe(false);
    expect(localStorage.getItem(QR_KEY)).toBe('app1_room1');
    expect(localStorage.getItem(SCOPE_KEY)).toBeTruthy();
  });
});
