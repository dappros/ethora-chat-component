import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { persistReducer, persistStore } from 'redux-persist';
import { encryptTransform } from 'redux-persist-transform-encrypt';
import {
  ANONYMOUS_PERSIST_SECRET_KEY,
  derivePersistSecretKey,
  getPersistSecretKey,
  readStableIdentity,
  resetPersistSecretKeyCache,
  sessionEncryptTransform,
} from './persistEncryption';
import { localStorageConstants } from '../helpers/constants/LOCAL_STORAGE';

// Regression coverage for the hardcoded persist key
// ('hey-this-is-dappros', which shipped inside every published dist
// bundle). The replacement has to hold four properties at once, and
// getting any of them wrong either logs the user out, loses their chat
// cache on a schedule, or white-screens on upgrade:
//   1. stable across an access-token rotation (authRefresh.ts rotates
//      several times an hour);
//   2. different per account;
//   3. an undecryptable blob is DISCARDED, never merged as undefined;
//   4. no session (SSR, logged out, first paint) still works.

const encodeJwt = (payload: Record<string, unknown>): string => {
  const b64 = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `JWT ${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature-${Math.random()}`;
};

const makeToken = (
  userId: string,
  appId: string,
  issuedAt: number
): string =>
  encodeJwt({
    data: { userId, appId },
    iat: issuedAt,
    exp: issuedAt + 900,
  });

const storeSession = (user: Record<string, unknown>) => {
  window.localStorage.setItem(
    localStorageConstants.ETHORA_USER_SESSION,
    JSON.stringify({ v: 2, ts: Date.now(), appId: user.appId, user })
  );
  resetPersistSecretKeyCache();
};

const USER_A = '65831a646edcd3cee0545757';
const USER_B = '65831a646edcd3cee0545999';
const APP_ID = '646cc8dc96d4a4dc8f7b2f2d';

beforeEach(() => {
  window.localStorage.clear();
  resetPersistSecretKeyCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  resetPersistSecretKeyCache();
});

describe('readStableIdentity', () => {
  it('reads userId / appId out of the JWT payload', () => {
    expect(
      readStableIdentity({ token: makeToken(USER_A, APP_ID, 1_700_000_000) })
    ).toEqual({ userId: USER_A, appId: APP_ID });
  });

  it('falls back to the plain user record when there is no parseable token', () => {
    expect(
      readStableIdentity({ token: 'not-a-jwt', _id: USER_A, appId: APP_ID })
    ).toEqual({ userId: USER_A, appId: APP_ID });
  });

  it('returns null when nothing identifies the account', () => {
    expect(readStableIdentity(null)).toBeNull();
    expect(readStableIdentity({})).toBeNull();
    expect(readStableIdentity({ token: 'JWT garbage.garbage' })).toBeNull();
  });
});

describe('derivePersistSecretKey', () => {
  it('never returns the old hardcoded key, or anything else guessable', () => {
    const key = derivePersistSecretKey({ userId: USER_A, appId: APP_ID });
    expect(key).not.toBe('hey-this-is-dappros');
    // sha256 hex.
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain(USER_A);
    expect(key).not.toContain(APP_ID);
  });

  it('falls back to the anonymous key with no identity', () => {
    expect(derivePersistSecretKey(null)).toBe(ANONYMOUS_PERSIST_SECRET_KEY);
    expect(derivePersistSecretKey(undefined)).toBe(ANONYMOUS_PERSIST_SECRET_KEY);
  });
});

describe('getPersistSecretKey', () => {
  it('is STABLE across an access-token rotation for the same user', () => {
    // What a rotation actually looks like: a brand new token string,
    // new iat/exp, new signature, same account.
    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_000_000),
      refreshToken: 'refresh-1',
    });
    const before = getPersistSecretKey();

    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_009_999),
      refreshToken: 'refresh-2',
    });
    const after = getPersistSecretKey();

    expect(after).toBe(before);
    expect(after).not.toBe(ANONYMOUS_PERSIST_SECRET_KEY);
  });

  it('differs between two different users on the same app', () => {
    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_000_000),
    });
    const keyA = getPersistSecretKey();

    storeSession({
      _id: USER_B,
      appId: APP_ID,
      token: makeToken(USER_B, APP_ID, 1_700_000_000),
    });
    const keyB = getPersistSecretKey();

    expect(keyB).not.toBe(keyA);
  });

  it('returns the deterministic anonymous key with no session', () => {
    expect(getPersistSecretKey()).toBe(ANONYMOUS_PERSIST_SECRET_KEY);
    // Deterministic: a second call (and a second page load) agrees, so
    // a logged-out blob is still readable by the next logged-out load.
    resetPersistSecretKeyCache();
    expect(getPersistSecretKey()).toBe(ANONYMOUS_PERSIST_SECRET_KEY);
  });

  it('does not throw when localStorage itself is unavailable', () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage disabled');
      });

    expect(() => getPersistSecretKey()).not.toThrow();
    expect(getPersistSecretKey()).toBe(ANONYMOUS_PERSIST_SECRET_KEY);
    getItem.mockRestore();
  });
});

describe('sessionEncryptTransform', () => {
  const roundTrip = (state: unknown, key = 'rooms') =>
    sessionEncryptTransform.out(
      sessionEncryptTransform.in(state as any, key as any, {} as any),
      key as any,
      {} as any
    );

  it('round-trips a slice written and read under the same session', () => {
    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_000_000),
    });

    const state = { 'r1@conf': { jid: 'r1@conf', messages: [{ id: 'm1' }] } };
    expect(roundTrip(state)).toEqual(state);
  });

  it('still round-trips after a token rotation, without a re-login', () => {
    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_000_000),
    });
    const state = { 'r1@conf': { jid: 'r1@conf', messages: [{ id: 'm1' }] } };
    const encrypted = sessionEncryptTransform.in(
      state as any,
      'rooms' as any,
      {} as any
    );

    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_009_999),
    });

    expect(
      sessionEncryptTransform.out(encrypted, 'rooms' as any, {} as any)
    ).toEqual(state);
  });

  it('produces ciphertext, not readable state', () => {
    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_000_000),
    });

    const encrypted = sessionEncryptTransform.in(
      { 'r1@conf': { messages: [{ body: 'top secret' }] } } as any,
      'rooms' as any,
      {} as any
    );

    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toContain('top secret');
  });

  it('discards a blob written under a DIFFERENT key by throwing, so redux-persist skips the slice', () => {
    // redux-persist's getStoredState rethrows out of its own try/catch
    // and persistReducer turns that into rehydrate(undefined, err) -
    // i.e. the slice is dropped and the reducer's initial state stands.
    // Returning undefined instead (the library default) would be hard
    // -set over the initial state and white-screen the next selector.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_000_000),
    });
    const encryptedForA = sessionEncryptTransform.in(
      { 'r1@conf': { messages: [{ id: 'm1' }] } } as any,
      'rooms' as any,
      {} as any
    );

    storeSession({
      _id: USER_B,
      appId: APP_ID,
      token: makeToken(USER_B, APP_ID, 1_700_000_000),
    });

    expect(() =>
      sessionEncryptTransform.out(encryptedForA, 'rooms' as any, {} as any)
    ).toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it('discards a blob written under the OLD hardcoded key (the upgrade path)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_000_000),
    });

    // What a pre-upgrade dist bundle left in localStorage: AES under
    // 'hey-this-is-dappros'. Built here through the same library so the
    // ciphertext format is identical to the real thing.
    const legacy = legacyEncrypt({ 'r1@conf': { messages: [{ id: 'old' }] } });

    expect(() =>
      sessionEncryptTransform.out(legacy, 'rooms' as any, {} as any)
    ).toThrow();
  });

  it('discards corrupted / truncated values without crashing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_000_000),
    });

    expect(() =>
      sessionEncryptTransform.out('not-ciphertext' as any, 'rooms' as any, {} as any)
    ).toThrow();
    expect(() =>
      sessionEncryptTransform.out({ rooms: {} } as any, 'rooms' as any, {} as any)
    ).toThrow();
  });

  it('works with no user at all - encrypt and decrypt still round-trip', () => {
    // Logged out / SSR-hydrated / first paint before login. The store
    // must come up normally; the anonymous key is deterministic, so a
    // blob written logged-out is readable on the next logged-out load.
    const state = { activeRoomJID: '' };
    expect(() => roundTrip(state)).not.toThrow();
    expect(roundTrip(state)).toEqual(state);
  });

  it('drops the anonymous blob once the user logs in, rather than exposing it', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const anonymous = sessionEncryptTransform.in(
      { 'r1@conf': {} } as any,
      'rooms' as any,
      {} as any
    );

    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_000_000),
    });

    expect(() =>
      sessionEncryptTransform.out(anonymous, 'rooms' as any, {} as any)
    ).toThrow();
  });
});

// The unit tests above prove the transform THROWS on an undecryptable
// blob. The claim that actually matters to a user is what redux-persist
// does with that throw, so drive the real library end to end: the slice
// must come back as clean initial state, rehydration must still
// complete, and nothing may escape as an unhandled error.
describe('rehydrating through redux-persist', () => {
  const initialState = { rooms: {}, activeRoomJID: '' };
  const baseReducer = (state = initialState) => state;

  const makeMemoryStorage = (seed: Record<string, string> = {}) => {
    const data: Record<string, string> = { ...seed };
    return {
      data,
      getItem: (key: string) => Promise.resolve(data[key] ?? null),
      setItem: (key: string, value: string) => {
        data[key] = value;
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        delete data[key];
        return Promise.resolve();
      },
    };
  };

  // redux-persist serializes TWICE: each key's transformed value is
  // JSON.stringify'd on its own, and the resulting map is stringified
  // again (createPersistoid). Seeding a raw ciphertext string instead
  // would make getStoredState throw on JSON.parse before the decrypt
  // ever ran, which would pass these tests for the wrong reason.
  const seedFor = (ciphertext: string) =>
    JSON.stringify({ rooms: JSON.stringify(ciphertext) });

  const rehydrate = async (seed: Record<string, string>) => {
    const engine = makeMemoryStorage(seed);
    const store = configureStore({
      reducer: persistReducer(
        {
          key: 'encryptionProbe',
          storage: engine as any,
          transforms: [sessionEncryptTransform],
        },
        baseReducer as any
      ),
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, immutableCheck: false }),
    });
    const persistor = persistStore(store);
    // Let getStoredState's promise chain settle, then force the
    // post-rehydrate write out of the persistoid's own throttle.
    for (let i = 0; i < 20; i++) {
      if ((store.getState() as any)?._persist?.rehydrated) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await persistor.flush();
    return { store, engine };
  };

  it('restores a slice encrypted under the current session key', async () => {
    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_000_000),
    });
    const rooms = { 'r1@conf': { jid: 'r1@conf' } };

    const { store } = await rehydrate({
      'persist:encryptionProbe': seedFor(
        sessionEncryptTransform.in(rooms as any, 'rooms' as any, {} as any)
      ),
    });

    expect((store.getState() as any).rooms).toEqual(rooms);
    expect((store.getState() as any)._persist.rehydrated).toBe(true);
  });

  it('starts clean on a blob from the old hardcoded key, and rewrites it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_000_000),
    });

    const stale = seedFor(
      legacyEncrypt({ 'r1@conf': { messages: [{ id: 'old' }] } })
    );
    const { store, engine } = await rehydrate({
      'persist:encryptionProbe': stale,
    });

    // Discarded, not merged: `rooms` is the reducer's initial value,
    // NOT undefined (undefined is what white-screens the selectors).
    expect((store.getState() as any).rooms).toEqual({});
    expect((store.getState() as any).rooms).not.toBeUndefined();
    // Still rehydrated, so the app boots and the user stays logged in.
    expect((store.getState() as any)._persist.rehydrated).toBe(true);
    // And the stale blob is replaced in place rather than orphaned.
    expect(engine.data['persist:encryptionProbe']).not.toBe(stale);
  });

  it('starts clean on another account`s blob', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    storeSession({
      _id: USER_B,
      appId: APP_ID,
      token: makeToken(USER_B, APP_ID, 1_700_000_000),
    });
    const foreign = sessionEncryptTransform.in(
      { 'r1@conf': { jid: 'r1@conf' } } as any,
      'rooms' as any,
      {} as any
    );

    storeSession({
      _id: USER_A,
      appId: APP_ID,
      token: makeToken(USER_A, APP_ID, 1_700_000_000),
    });
    const { store } = await rehydrate({
      'persist:encryptionProbe': seedFor(foreign),
    });

    expect((store.getState() as any).rooms).toEqual({});
    expect((store.getState() as any)._persist.rehydrated).toBe(true);
  });

  it('boots with no session at all', async () => {
    const { store } = await rehydrate({});
    expect((store.getState() as any).rooms).toEqual({});
    expect((store.getState() as any)._persist.rehydrated).toBe(true);
  });
});

// Kept at the bottom: it is the only place the dead key is still
// written down, and only so the upgrade path above can be exercised.
function legacyEncrypt(state: unknown): string {
  const legacyTransform = encryptTransform({
    secretKey: 'hey-this-is-dappros',
    onError: () => undefined,
  });
  return legacyTransform.in(state as any, 'rooms' as any, {} as any);
}
