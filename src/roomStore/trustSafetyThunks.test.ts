import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import trustSafetySlice, {
  markMediaBlocked,
  revealMessageMedia,
} from './trustSafetySlice';
import {
  __resetTrustSafetyRequestsForTests,
  declareMyAge,
  ensureAppPolicy,
  ensureMyAge,
} from './trustSafetyThunks';
import {
  normalizeAppTrustSafety,
  normalizeUserAge,
} from '../networking/api-requests/trustSafety.api';

const makeStore = () =>
  configureStore({
    reducer: { trustSafety: trustSafetySlice },
  });

const adult = { birthYear: 1990, isAdult: true, declaredAt: '2026-11-01', canDeclareAdult: true };

describe('trust & safety lookups', () => {
  beforeEach(() => __resetTrustSafetyRequestsForTests());

  it('asks for the App policy once per session, sharing the request in flight', async () => {
    const store = makeStore();
    const get = vi.fn(async () => ({ enabled: true, ageGate: false }));
    const [a, b] = await Promise.all([
      ensureAppPolicy(store, 'app1', { get }),
      ensureAppPolicy(store, 'app1', { get }),
    ]);
    await ensureAppPolicy(store, 'app1', { get });
    expect(get).toHaveBeenCalledTimes(1);
    expect(a.ageGate).toBe(false);
    expect(b.ageGate).toBe(false);
    expect(store.getState().trustSafety.policy.app1.status).toBe('loaded');
  });

  it('an unknown policy is treated as age gated', async () => {
    const store = makeStore();
    const policy = await ensureAppPolicy(store, 'app1', {
      get: vi.fn(async () => {
        throw new Error('404');
      }),
    });
    expect(policy.ageGate).toBe(true);
    expect(await ensureAppPolicy(store, undefined)).toMatchObject({ ageGate: true });
  });

  it('caches the age for the session', async () => {
    const store = makeStore();
    const get = vi.fn(async () => adult);
    expect((await ensureMyAge(store, { get })).isAdult).toBe(true);
    await ensureMyAge(store, { get });
    expect(get).toHaveBeenCalledTimes(1);
    expect(store.getState().trustSafety.age).toMatchObject({ status: 'loaded', isAdult: true });
  });

  it('a failed age lookup is unknown (the dialog asks)', async () => {
    const store = makeStore();
    const age = await ensureMyAge(store, {
      get: vi.fn(async () => {
        throw new Error('down');
      }),
    });
    expect(age.isAdult).toBeNull();
    expect(store.getState().trustSafety.age.status).toBe('error');
  });

  it('declaring an age stores what the server returned', async () => {
    const store = makeStore();
    const put = vi.fn(async () => ({ ...adult, isAdult: false, birthYear: 2012 }));
    const age = await declareMyAge(store, '2012-04-01', { put });
    expect(put).toHaveBeenCalledWith('2012-04-01');
    expect(age.isAdult).toBe(false);
    expect(store.getState().trustSafety.age.birthYear).toBe(2012);
  });
});

describe('trustSafety slice', () => {
  it('moderation blocks un-reveal a message, and logout clears everything', () => {
    const store = makeStore();
    store.dispatch(revealMessageMedia('m1'));
    store.dispatch(markMediaBlocked({ messageId: 'm1', reason: 'moderation' }));
    expect(store.getState().trustSafety.revealed.m1).toBeUndefined();
    expect(store.getState().trustSafety.blocked.m1).toBe('moderation');
    store.dispatch({ type: 'chatSettingStore/logout' });
    expect(store.getState().trustSafety.blocked).toEqual({});
  });
});

describe('response normalisers', () => {
  it('accepts flat and enveloped shapes', () => {
    expect(normalizeAppTrustSafety({ success: true, enabled: true, ageGate: false })).toMatchObject({
      enabled: true,
      ageGate: false,
    });
    expect(normalizeAppTrustSafety({ data: { enabled: true } }).ageGate).toBe(true);
    expect(normalizeUserAge({ result: { birthYear: 0, isAdult: null } })).toEqual({
      birthYear: null,
      isAdult: null,
      declaredAt: null,
      canDeclareAdult: true,
    });
    expect(normalizeUserAge({ age: adult })).toEqual(adult);
  });
});
