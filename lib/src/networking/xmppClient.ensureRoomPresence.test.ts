import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Regression: ensureRoomPresence used to let a caller piggyback on someone
// else's in-flight room join with no regard for its OWN timeoutMs. The
// startup presence sweep and background history preload now route through
// this same dedup layer with much longer budgets (5000ms / 2000ms) than a
// message send (900ms) - so a send arriving while the sweep was still
// joining that room ended up waiting for the sweep's timeout instead of its
// own, which is what made "sending a message" feel newly slow. The fix
// races the piggybacked wait against the caller's own timeoutMs.

const fakeXmppClient = {
  jid: { toString: () => 'me@example.com/res', domain: 'example.com' },
  setMaxListeners: vi.fn(),
  reconnect: { stop: vi.fn() },
  on: vi.fn(),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
  start: vi.fn(() => Promise.resolve()),
};

vi.mock('@xmpp/client', () => ({
  default: { client: vi.fn(() => fakeXmppClient) },
  xml: (...args: any[]) => ({ args }),
}));

import { XmppClient } from './xmppClient';

const ROOM_JID = 'room1@conference.example.com';

describe('ensureRoomPresence - piggybacking on an in-flight join', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not wait past its own timeoutMs when someone else\'s longer join is in flight', async () => {
    const client = new XmppClient('user', 'pass') as any;

    // Seed roomPresenceInFlight the way the startup sweep would: a join
    // that was kicked off with a 5000ms budget and is still pending.
    let resolveSweepJoin: (v: boolean) => void = () => {};
    const sweepJoinPromise = new Promise<boolean>((resolve) => {
      resolveSweepJoin = resolve;
    });
    client.roomPresenceInFlight.set(ROOM_JID, sweepJoinPromise);

    // A send comes in shortly after, with its own much shorter budget.
    const sendResultPromise = client.ensureRoomPresence(ROOM_JID, {
      settleDelay: 0,
      timeoutMs: 900,
      waitForJoin: true,
      source: 'send',
    });

    // Advance past the send's own budget while the sweep's join is still
    // unresolved.
    await vi.advanceTimersByTimeAsync(901);

    const joined = await sendResultPromise;
    expect(joined).toBe(false);

    // The original sweep join is untouched and can still resolve later -
    // other callers (or the sweep itself) still benefit from it.
    resolveSweepJoin(true);
    await expect(sweepJoinPromise).resolves.toBe(true);
  });

  it('still resolves true if the in-flight join settles before its own timeout', async () => {
    const client = new XmppClient('user', 'pass') as any;

    let resolveJoin: (v: boolean) => void = () => {};
    const joinPromise = new Promise<boolean>((resolve) => {
      resolveJoin = resolve;
    });
    client.roomPresenceInFlight.set(ROOM_JID, joinPromise);

    const sendResultPromise = client.ensureRoomPresence(ROOM_JID, {
      settleDelay: 0,
      timeoutMs: 900,
      waitForJoin: true,
      source: 'send',
    });

    resolveJoin(true);
    await vi.advanceTimersByTimeAsync(10);

    await expect(sendResultPromise).resolves.toBe(true);
  });
});
