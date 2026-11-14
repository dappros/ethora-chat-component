import { describe, expect, it, vi, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

// Same reasons as logoutMiddleware.test.ts: keep the real clientRegistry
// (and through it xmppClient -> roomStore/index) out of this test.
let currentClient: any = null;
vi.mock('../../utils/clientRegistry', () => ({
  getGlobalXmppClient: () => currentClient,
  setGlobalXmppClient: (client: any) => {
    currentClient = client;
  },
}));
vi.mock('../../helpers/ethoraLogger', () => ({
  ethoraLogger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../../helpers/authStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../helpers/authStorage')>()),
  persistUserSession: vi.fn(),
  clearStoredUser: vi.fn(),
}));

import chatSettingsReducer, {
  clearAccountBlocked,
  setAccountBlocked,
  setConfig,
} from '../chatSettingsSlice';
import {
  ACCOUNT_BLOCKED_EVENT,
  accountBlockedMiddleware,
} from './accountBlockedMiddleware';
import type { AccountBlockedInfo } from '../../helpers/accountBlocked';

const SUSPENDED: AccountBlockedInfo = {
  blocked: 'suspended',
  code: 'USER_SUSPENDED',
  suspension: {
    reasonCode: 'child_safety',
    message: 'Contact us to appeal.',
    suspendedAt: '2026-11-01T10:00:00.000Z',
    until: null,
    supportContact: 'https://example.com/appeal',
  },
};

const makeStore = (onAccountBlocked?: (info: AccountBlockedInfo) => void) => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsReducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }).concat(
        accountBlockedMiddleware
      ),
  });
  store.dispatch(setConfig({ onAccountBlocked } as any));
  return store;
};

describe('accountBlockedMiddleware', () => {
  afterEach(() => {
    currentClient = null;
    vi.restoreAllMocks();
  });

  it('closes XMPP without reconnects and calls onAccountBlocked once', () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    currentClient = { disconnect };
    const onAccountBlocked = vi.fn();
    const store = makeStore(onAccountBlocked);
    const eventListener = vi.fn();
    window.addEventListener(ACCOUNT_BLOCKED_EVENT, eventListener);

    store.dispatch(setAccountBlocked(SUSPENDED));
    store.dispatch(setAccountBlocked({ ...SUSPENDED, code: 'USER_SUSPENDED' }));
    store.dispatch(setAccountBlocked({ blocked: 'archived', code: 'USER_ARCHIVED' }));

    window.removeEventListener(ACCOUNT_BLOCKED_EVENT, eventListener);

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledWith({ suppressReconnect: true });
    expect(currentClient).toBeNull();
    expect(eventListener).toHaveBeenCalledTimes(1);
    expect(onAccountBlocked).toHaveBeenCalledTimes(1);
    // The host gets the block itself, not the internal identity key.
    expect(onAccountBlocked).toHaveBeenCalledWith(SUSPENDED);
  });

  it('fires again for a new block after the previous one was cleared', () => {
    const onAccountBlocked = vi.fn();
    const store = makeStore(onAccountBlocked);

    store.dispatch(setAccountBlocked(SUSPENDED));
    store.dispatch(clearAccountBlocked());
    store.dispatch(setAccountBlocked(SUSPENDED));

    expect(onAccountBlocked).toHaveBeenCalledTimes(2);
  });

  it('survives a host handler that throws or rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const throwing = makeStore(() => {
      throw new Error('host bug');
    });
    expect(() => throwing.dispatch(setAccountBlocked(SUSPENDED))).not.toThrow();
    expect(throwing.getState().chatSettingStore.accountStatus).not.toBeNull();

    const rejecting = makeStore(() => Promise.reject(new Error('async bug')) as any);
    rejecting.dispatch(setAccountBlocked(SUSPENDED));
    await Promise.resolve();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
  });

  it('ignores every other action', () => {
    const disconnect = vi.fn();
    currentClient = { disconnect };
    const store = makeStore(vi.fn());
    store.dispatch({ type: 'chatSettingStore/setLangSource', payload: 'en' });
    expect(disconnect).not.toHaveBeenCalled();
  });
});
