import { describe, expect, it, vi, afterEach } from 'vitest';
import { presenceInRoom } from './presenceInRoom.xmpp';

// Regression: presenceInRoom's timeout timer used to keep running after a
// successful join (via the fire-and-forget createTimeoutPromise(...).catch),
// so it could still fire, call unsubscribe again, and construct a stray
// rejection well after the caller already had its answer.
const makeClient = () => {
  const handlers: Array<(stanza: any) => void> = [];
  return {
    jid: {
      toString: () => 'me@example.com/res',
      getLocal: () => 'me',
    },
    on: vi.fn((event: string, handler: any) => {
      if (event === 'stanza') handlers.push(handler);
    }),
    off: vi.fn((event: string, handler: any) => {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }),
    send: vi.fn(() => Promise.resolve()),
    emitStanza: (stanza: any) => {
      handlers.slice().forEach((h) => h(stanza));
    },
  } as any;
};

const fakePresenceResult = (id: string, from: string) => ({
  is: (tag: string) => tag === 'presence',
  attrs: { id, from, type: undefined },
});

describe('presenceInRoom', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves once the join presence stanza comes back', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const roomJID = 'room1@conference.example.com';

    const joinPromise = presenceInRoom(client, roomJID, 0, 2000);
    // Flush the microtask from client.send(...).then(...) that installs
    // the timeout before we emit the reply.
    await Promise.resolve();
    await Promise.resolve();
    const sentPresence = client.send.mock.calls[0][0];
    client.emitStanza(
      fakePresenceResult(sentPresence.attrs.id, `${roomJID}/me`)
    );
    // finish() resolves via a `delay`-ms setTimeout (0 here) - advance fake
    // timers so it actually fires instead of leaving the promise pending.
    await vi.advanceTimersByTimeAsync(0);

    await expect(joinPromise).resolves.toBeDefined();
  });

  it('does not let the timeout fire after a successful join', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const roomJID = 'room1@conference.example.com';

    const joinPromise = presenceInRoom(client, roomJID, 0, 2000);
    await Promise.resolve();
    await Promise.resolve();
    const sentPresence = client.send.mock.calls[0][0];
    client.emitStanza(
      fakePresenceResult(sentPresence.attrs.id, `${roomJID}/me`)
    );
    await vi.advanceTimersByTimeAsync(0);
    await joinPromise;

    const offCallsBeforeTimeout = client.off.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);

    // unsubscribe() must not have been invoked again by a stray timer.
    expect(client.off.mock.calls.length).toBe(offCallsBeforeTimeout);
  });

  it('still rejects with a timeout error if no presence reply arrives', async () => {
    vi.useFakeTimers();
    const client = makeClient();
    const roomJID = 'room1@conference.example.com';

    const joinPromise = presenceInRoom(client, roomJID, 0, 2000);
    await Promise.resolve();
    await Promise.resolve();
    const assertion = expect(joinPromise).rejects.toThrow(
      `presence_timeout:${roomJID}`
    );
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
  });
});
