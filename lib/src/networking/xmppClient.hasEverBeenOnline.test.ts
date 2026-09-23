import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Bug C, part 2 (measured live: a 200ms DOM poll for "Connection lost"
 * found the banner visible for ~2s on every cold start, samples 4-13).
 *
 * A brand-new client spends its first second or two sitting in
 * 'connecting'/'offline' while the WS handshake + SASL bind for a session
 * that has NEVER been online yet are still in flight - that is an ordinary
 * first connect, not a lost one. `hasEverBeenOnline` is the one-way latch
 * that tells the two apart: false until the client's first 'online', then
 * true for the rest of the instance's life no matter what happens next, so
 * a later GENUINE drop (a session that WAS online and then lost the
 * socket) still reads as connection-lost. See useChatWrapperInit's
 * isStatusConnectionLost for the consumer side of this flag.
 */
const listeners = new Map<string, Array<(...args: unknown[]) => unknown>>();

const fakeXmppClient = {
  jid: { toString: () => 'me@example.com/res', domain: 'example.com' },
  setMaxListeners: vi.fn(),
  reconnect: { stop: vi.fn() },
  on: vi.fn((event: string, cb: (...args: unknown[]) => unknown) => {
    const arr = listeners.get(event) || [];
    arr.push(cb);
    listeners.set(event, arr);
  }),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(() => Promise.resolve()),
  send: vi.fn(),
};

vi.mock('@xmpp/client', () => ({
  default: { client: vi.fn(() => fakeXmppClient) },
  xml: (...args: unknown[]) => ({ args }),
}));

import { XmppClient } from './xmppClient';

/** Fires every handler registered for `event` and waits for each to settle. */
const emit = async (event: string, ...args: unknown[]) => {
  const handlers = listeners.get(event) || [];
  await Promise.all(
    handlers.map((handler) =>
      Promise.resolve(handler(...args)).catch(() => undefined)
    )
  );
};

const fakeJid = { resource: 'res', toString: () => 'me@example.com/res' };

describe('XmppClient.hasEverBeenOnline', () => {
  beforeEach(() => {
    listeners.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is false for a brand new client that has never reached online (mid first connect)', () => {
    const client = new XmppClient('user', 'pass') as any;

    expect(client.hasEverBeenOnline).toBe(false);
    // The initial connect legitimately sits in 'offline'/'connecting' here -
    // that must not be mistaken for a lost connection (see
    // isStatusConnectionLost's `hasEverBeenOnline` gate).
    expect(['offline', 'connecting']).toContain(client.status);
  });

  it('flips true on the first "online" event', async () => {
    const client = new XmppClient('user', 'pass') as any;

    await emit('online', fakeJid);

    expect(client.hasEverBeenOnline).toBe(true);
    expect(client.status).toBe('online');
  });

  it('stays true after a later real drop - a session that WAS online reads as lost, not "still connecting"', async () => {
    const client = new XmppClient('user', 'pass') as any;

    await emit('online', fakeJid);
    expect(client.hasEverBeenOnline).toBe(true);

    await emit('disconnect');

    expect(client.hasEverBeenOnline).toBe(true);
    expect(client.status).toBe('offline');
  });

  it('stays true through a reconnect cycle (offline -> connecting -> online again)', async () => {
    const client = new XmppClient('user', 'pass') as any;

    await emit('online', fakeJid);
    await emit('disconnect');
    expect(client.hasEverBeenOnline).toBe(true);

    await emit('connecting');
    expect(client.hasEverBeenOnline).toBe(true);

    await emit('online', fakeJid);
    expect(client.hasEverBeenOnline).toBe(true);
  });

  it('a second, independent client starts false even after another instance has been online', async () => {
    const first = new XmppClient('user', 'pass') as any;
    await emit('online', fakeJid);
    expect(first.hasEverBeenOnline).toBe(true);

    listeners.clear();
    const second = new XmppClient('user2', 'pass2') as any;
    expect(second.hasEverBeenOnline).toBe(false);
  });
});
