import { describe, expect, it, vi } from 'vitest';
import { withXmppClientInitLock } from './clientRegistry';

// The lock exists so two concurrent initializeClient() calls for the same
// identity produce ONE XmppClient. Two clients binding the same JID make
// the server kill one of the streams (<stream:error>), and both sides then
// re-schedule their own reconnect - the exact "XMPP client error:
// StreamError" -> "Disconnected from server" loop seen on refresh.
describe('withXmppClientInitLock', () => {
  it('two concurrent calls for the same key run init only ONCE', async () => {
    const init = vi.fn(
      () =>
        new Promise<any>((resolve) =>
          setTimeout(() => resolve({ id: 'client' }), 10)
        )
    );

    // Fire both before awaiting either - the real race: React effects in
    // the provider and ChatWrapper both call initializeClient in the same
    // tick.
    const [a, b] = await Promise.all([
      withXmppClientInitLock('same-key', init),
      withXmppClientInitLock('same-key', init),
    ]);

    expect(init).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('different keys still init independently', async () => {
    const init = vi.fn(() => Promise.resolve({ id: 'c' } as any));

    await Promise.all([
      withXmppClientInitLock('key-a', init),
      withXmppClientInitLock('key-b', init),
    ]);

    expect(init).toHaveBeenCalledTimes(2);
  });

  it('releases the lock so a later call can init again', async () => {
    const init = vi.fn(() => Promise.resolve({ id: 'c' } as any));

    await withXmppClientInitLock('key-seq', init);
    await withXmppClientInitLock('key-seq', init);

    expect(init).toHaveBeenCalledTimes(2);
  });

  it('releases the lock even when init rejects', async () => {
    const failing = vi.fn(() => Promise.reject(new Error('boom')));
    await expect(withXmppClientInitLock('key-fail', failing)).rejects.toThrow('boom');

    const ok = vi.fn(() => Promise.resolve({ id: 'c' } as any));
    await expect(withXmppClientInitLock('key-fail', ok)).resolves.toBeTruthy();
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
