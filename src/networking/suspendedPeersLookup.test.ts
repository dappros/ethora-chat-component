import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureStore,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import trustSafetySlice from '../roomStore/trustSafetySlice';
import { createSuspendedPeersLookup } from './suspendedPeersLookup';
import { SUSPENDED_STATUS_TTL_MS } from '../helpers/suspendedPeers';
import { normalizeSuspendedStatus } from './api-requests/trustSafety.api';

const ME = 'app1_me';

const settings = createSlice({
  name: 'chatSettingStore',
  initialState: {
    user: { xmppUsername: ME, token: 't' } as {
      xmppUsername: string;
      token: string;
    },
    config: {} as { disableSuspendedPeers?: boolean },
  },
  reducers: {
    setConfig(
      state,
      action: PayloadAction<{ disableSuspendedPeers?: boolean }>
    ) {
      state.config = action.payload;
    },
    setUser(state, action: PayloadAction<string>) {
      state.user = { xmppUsername: action.payload, token: 't' };
    },
  },
});

const makeStore = () =>
  configureStore({
    reducer: {
      trustSafety: trustSafetySlice,
      chatSettingStore: settings.reducer,
    },
  });

type TestStore = ReturnType<typeof makeStore>;

const setup = (api: (names: string[]) => Promise<string[]>) => {
  const store = makeStore();
  const lookup = createSuspendedPeersLookup(() => store, {
    api,
    debounceMs: 100,
    maxWaitMs: 400,
    now: () => Date.now(),
  });
  return { store, lookup };
};

const peers = (store: TestStore) => store.getState().trustSafety.peers;

// Lets the queued batch run: timers first, then the awaited API promise.
const settle = async (ms = 500) => {
  await vi.advanceTimersByTimeAsync(ms);
};

describe('suspended peers lookup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('batches names asked for in a burst into one call and stores the answer', async () => {
    const api = vi.fn(async (names: string[]) =>
      names.filter((n) => n === 'app1_bob')
    );
    const { store, lookup } = setup(api);

    lookup.request(['app1_alice']);
    lookup.request(['app1_bob@xmpp.example.com/web', 'app1_alice']);
    lookup.request(['app1_carol', ME]);
    expect(api).not.toHaveBeenCalled();

    await settle();
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0][0].sort()).toEqual([
      'app1_alice',
      'app1_bob',
      'app1_carol',
    ]);
    expect(peers(store).app1_bob.suspended).toBe(true);
    expect(peers(store).app1_alice.suspended).toBe(false);
    expect(peers(store)[ME]).toBeUndefined();
  });

  it('a steady trickle of requests is still sent within maxWait', async () => {
    const api = vi.fn(async () => []);
    const { lookup } = setup(api);
    for (let i = 0; i < 8; i++) {
      lookup.request([`app1_u${i}`]);
      await vi.advanceTimersByTimeAsync(60);
    }
    // 8 x 60ms = 480ms > maxWait 400ms: the first batch went out already.
    expect(api).toHaveBeenCalled();
  });

  it('sends at most 500 names per call', async () => {
    const api = vi.fn(async () => []);
    const { store, lookup } = setup(api);
    lookup.request(Array.from({ length: 1234 }, (_, i) => `app1_u${i}`));
    await settle();
    expect(api.mock.calls.map((call) => (call[0] as string[]).length)).toEqual([
      500, 500, 234,
    ]);
    expect(Object.keys(peers(store))).toHaveLength(1234);
  });

  it('does not ask again within five minutes, and asks a watched name again after', async () => {
    const api = vi.fn(async () => ['app1_bob']);
    const { store, lookup } = setup(api);

    const stop = lookup.watch('app1_bob');
    await settle();
    expect(api).toHaveBeenCalledTimes(1);

    lookup.request(['app1_bob']);
    await settle();
    expect(api).toHaveBeenCalledTimes(1);

    // Lifted meanwhile: the next answer no longer lists it.
    api.mockImplementation(async () => []);
    await vi.advanceTimersByTimeAsync(SUSPENDED_STATUS_TTL_MS + 60_000);
    expect(api).toHaveBeenCalledTimes(2);
    expect(peers(store).app1_bob.suspended).toBe(false);

    stop();
    await vi.advanceTimersByTimeAsync(2 * SUSPENDED_STATUS_TTL_MS);
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('ignores failures, and leaves the name alone for a while', async () => {
    const api = vi.fn(async () => {
      throw Object.assign(new Error('boom'), { response: { status: 500 } });
    });
    const { store, lookup } = setup(api);
    lookup.request(['app1_bob']);
    await settle();
    expect(api).toHaveBeenCalledTimes(1);
    expect(peers(store)).toEqual({});

    lookup.request(['app1_bob']);
    await settle();
    expect(api).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(61_000);
    lookup.request(['app1_bob']);
    await settle();
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('stops asking a backend that does not have the route', async () => {
    const api = vi.fn(async () => {
      throw Object.assign(new Error('nope'), { response: { status: 404 } });
    });
    const { lookup } = setup(api);
    lookup.request(['app1_bob']);
    await settle();
    await vi.advanceTimersByTimeAsync(SUSPENDED_STATUS_TTL_MS);
    lookup.request(['app1_carol']);
    await settle();
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('does nothing with config.disableSuspendedPeers', async () => {
    const api = vi.fn(async () => []);
    const { store, lookup } = setup(api);
    store.dispatch(settings.actions.setConfig({ disableSuspendedPeers: true }));
    lookup.request(['app1_bob']);
    lookup.watch('app1_carol');
    await settle();
    expect(api).not.toHaveBeenCalled();
  });

  it('a bounce marks the name suspended without a lookup', async () => {
    const api = vi.fn(async () => []);
    const { store, lookup } = setup(api);
    lookup.markSuspended('app1_bob@xmpp.example.com');
    expect(peers(store).app1_bob).toEqual({
      suspended: true,
      checkedAt: Date.now(),
    });
    lookup.request(['app1_bob']);
    await settle();
    expect(api).not.toHaveBeenCalled();
  });

  it('forgets failures when another account signs in', async () => {
    const api = vi.fn(async () => {
      throw Object.assign(new Error('boom'), { response: { status: 500 } });
    });
    const { store, lookup } = setup(api);
    lookup.request(['app1_bob']);
    await settle();
    store.dispatch(settings.actions.setUser('app1_other'));
    lookup.request(['app1_bob']);
    await settle();
    expect(api).toHaveBeenCalledTimes(2);
  });
});

describe('normalizeSuspendedStatus', () => {
  it('accepts the plain answer and the v2 envelopes', () => {
    expect(normalizeSuspendedStatus({ suspended: ['a', 'b'] })).toEqual([
      'a',
      'b',
    ]);
    expect(
      normalizeSuspendedStatus({ success: true, data: { suspended: ['a'] } })
    ).toEqual(['a']);
    expect(
      normalizeSuspendedStatus({ result: { suspended: ['a', 1, ''] } })
    ).toEqual(['a']);
    expect(normalizeSuspendedStatus(null)).toEqual([]);
  });
});
