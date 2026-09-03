import { describe, expect, it, vi, afterEach } from 'vitest';
import { getRoomsPaged } from './getRoomsPaged.xmpp';

// Regression 1: the stanza handler checked stanza.attrs.id === 'getUserRooms'
// while the request is actually sent with id 'getUserRoomsPaged' - the two
// never matched, so every real server reply was ignored and getRoomsPaged
// always fell through to the 2s timeout rejection.
// Regression 2: once resolved, the 2s timeout timer used to keep running
// and could still reject/unsubscribe after the call already settled.
const makeClient = () => {
  const handlers: Array<(stanza: any) => void> = [];
  return {
    jid: { toString: () => 'me@example.com/res' },
    on: vi.fn((event: string, handler: any) => {
      if (event === 'stanza') handlers.push(handler);
    }),
    off: vi.fn((event: string, handler: any) => {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    }),
    send: vi.fn(),
    emitStanza: (stanza: any) => {
      handlers.slice().forEach((h) => h(stanza));
    },
  } as any;
};

const fakeIqResult = (id: string) => ({
  is: (tag: string) => tag === 'iq',
  attrs: { id, type: 'result' },
});

describe('getRoomsPaged', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves on the real server reply instead of timing out', async () => {
    vi.useFakeTimers();
    const client = makeClient();

    const resultPromise = getRoomsPaged(client, 3, null);
    client.emitStanza(fakeIqResult('getUserRoomsPaged'));

    const result = await resultPromise;
    expect((result as any).attrs.id).toBe('getUserRoomsPaged');
  });

  it('unsubscribes from the stanza listener once resolved', async () => {
    vi.useFakeTimers();
    const client = makeClient();

    const resultPromise = getRoomsPaged(client, 3, null);
    client.emitStanza(fakeIqResult('getUserRoomsPaged'));
    await resultPromise;

    expect(client.off).toHaveBeenCalledWith('stanza', expect.any(Function));
  });

  it('does not reject after the 2s timeout once already resolved', async () => {
    vi.useFakeTimers();
    const client = makeClient();

    const resultPromise = getRoomsPaged(client, 3, null);
    client.emitStanza(fakeIqResult('getUserRoomsPaged'));
    await resultPromise;

    // Advance well past the 2s timeout; the cancelled timer must not fire
    // a late rejection into an already-settled promise.
    vi.advanceTimersByTime(5000);
    await Promise.resolve();

    await expect(resultPromise).resolves.toBeDefined();
  });

  it('still times out if the server never replies', async () => {
    vi.useFakeTimers();
    const client = makeClient();

    const resultPromise = getRoomsPaged(client, 3, null);
    const assertion = expect(resultPromise).rejects.toThrow('timeout:2000');
    vi.advanceTimersByTime(2000);
    await assertion;
  });
});
