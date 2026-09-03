import { describe, expect, it, vi } from 'vitest';
import {
  sweepPushSubscriptions,
  PUSH_SWEEP_CONCURRENCY,
  PushSweepGuards,
} from './pushSubscriptionSweep';

// Regression: the push subscription sweep used to be a strictly serial
// for-loop with a fixed 100ms sleep between every room, so N rooms took at
// least N*100ms even though nothing about subscribing depends on room
// order. sweepPushSubscriptions replaces that with a small worker pool
// while preserving every guard (status skip-list, retry backoff, in-flight
// lock).

const makeGuards = (
  overrides: Partial<PushSweepGuards> = {}
): { guards: PushSweepGuards; statuses: Record<string, string> } => {
  const statuses: Record<string, string> = {};
  const inFlight = new Set<string>();
  const guards: PushSweepGuards = {
    getStatus: (jid) => statuses[jid],
    getRetryAt: () => undefined,
    isInFlight: (jid) => inFlight.has(jid),
    markInFlight: (jid) => {
      inFlight.add(jid);
    },
    clearInFlight: (jid) => {
      inFlight.delete(jid);
    },
    setStatus: (jid, status) => {
      statuses[jid] = status;
    },
    subscribe: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
  return { guards, statuses };
};

describe('sweepPushSubscriptions', () => {
  it('subscribes every eligible room and marks it subscribed', async () => {
    const rooms = ['a', 'b', 'c'];
    const { guards, statuses } = makeGuards();

    await sweepPushSubscriptions(rooms, guards);

    for (const jid of rooms) {
      expect(statuses[jid]).toBe('subscribed');
    }
    expect(guards.subscribe).toHaveBeenCalledTimes(3);
  });

  it('runs subscriptions with bounded concurrency, not one at a time', async () => {
    const rooms = Array.from({ length: 8 }, (_, i) => `room${i}`);
    let inFlightCount = 0;
    let maxInFlight = 0;

    const { guards } = makeGuards({
      subscribe: vi.fn(async () => {
        inFlightCount++;
        maxInFlight = Math.max(maxInFlight, inFlightCount);
        // Yield so other workers can start concurrently before this resolves.
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlightCount--;
        return { ok: true };
      }),
    });

    await sweepPushSubscriptions(rooms, guards, PUSH_SWEEP_CONCURRENCY);

    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(PUSH_SWEEP_CONCURRENCY);
  });

  it('skips rooms whose status is already subscribed/pending/blocked/error', async () => {
    const rooms = ['subscribed-room', 'pending-room', 'blocked-room', 'error-room', 'idle-room'];
    const { guards, statuses } = makeGuards();
    statuses['subscribed-room'] = 'subscribed';
    statuses['pending-room'] = 'pending';
    statuses['blocked-room'] = 'blocked';
    statuses['error-room'] = 'error';

    await sweepPushSubscriptions(rooms, guards);

    expect(guards.subscribe).toHaveBeenCalledTimes(1);
    expect(guards.subscribe).toHaveBeenCalledWith('idle-room');
  });

  it('respects the retry-at backoff for a room', async () => {
    const rooms = ['backoff-room'];
    const { guards } = makeGuards({
      getRetryAt: () => Date.now() + 60_000,
    });

    await sweepPushSubscriptions(rooms, guards);

    expect(guards.subscribe).not.toHaveBeenCalled();
  });

  it('skips a room already marked in-flight', async () => {
    const rooms = ['inflight-room'];
    const { guards } = makeGuards({
      isInFlight: () => true,
    });

    await sweepPushSubscriptions(rooms, guards);

    expect(guards.subscribe).not.toHaveBeenCalled();
  });

  it('marks a room blocked on a forbidden result and error otherwise', async () => {
    const rooms = ['forbidden-room', 'other-fail-room'];
    const { guards, statuses } = makeGuards({
      subscribe: vi.fn(async (jid: string) =>
        jid === 'forbidden-room'
          ? { ok: false, reason: 'forbidden' }
          : { ok: false, reason: 'network' }
      ),
    });

    await sweepPushSubscriptions(rooms, guards);

    expect(statuses['forbidden-room']).toBe('blocked');
    expect(statuses['other-fail-room']).toBe('error');
  });

  it('marks a room error when subscribe throws', async () => {
    const rooms = ['throwing-room'];
    const { guards, statuses } = makeGuards({
      subscribe: vi.fn(async () => {
        throw new Error('boom');
      }),
    });

    await sweepPushSubscriptions(rooms, guards);

    expect(statuses['throwing-room']).toBe('error');
  });

  it('clears the in-flight lock after each room, success or failure', async () => {
    const inFlightAfter: Record<string, boolean> = {};
    const rooms = ['ok-room', 'fail-room'];
    const inFlight = new Set<string>();
    const { guards } = makeGuards({
      isInFlight: (jid) => inFlight.has(jid),
      markInFlight: (jid) => inFlight.add(jid),
      clearInFlight: (jid) => inFlight.delete(jid),
      subscribe: vi.fn(async (jid: string) => {
        if (jid === 'fail-room') throw new Error('boom');
        return { ok: true };
      }),
    });

    await sweepPushSubscriptions(rooms, guards);

    for (const jid of rooms) {
      inFlightAfter[jid] = inFlight.has(jid);
    }
    expect(inFlightAfter['ok-room']).toBe(false);
    expect(inFlightAfter['fail-room']).toBe(false);
  });
});
