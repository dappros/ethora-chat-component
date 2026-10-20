import { describe, expect, it, vi } from 'vitest';
import { P2PSignalInbox } from './signalInbox';
import type { P2PSignal } from './signalStanza';

const sig = (callId: string, n = 0): P2PSignal => ({
  callId,
  signal: 'candidate',
  payload: { candidate: `c${n}` },
  fromBare: 'a@x',
  fromLocal: 'a',
  ageMs: null,
  delayed: false,
});

describe('P2PSignalInbox', () => {
  it('delivers straight to an attached handler', () => {
    const inbox = new P2PSignalInbox();
    const seen: string[] = [];
    inbox.attach('c1', (s) => seen.push((s.payload as any).candidate));
    expect(inbox.receive(sig('c1', 1))).toBe('delivered');
    expect(seen).toEqual(['c1']);
  });

  it('holds signals for an unclaimed call and replays them in order on attach', () => {
    const inbox = new P2PSignalInbox();
    expect(inbox.receive(sig('c1', 1))).toBe('buffered');
    expect(inbox.receive(sig('c1', 2))).toBe('buffered');
    const seen: string[] = [];
    inbox.attach('c1', (s) => seen.push((s.payload as any).candidate));
    expect(seen).toEqual(['c1', 'c2']);
    inbox.receive(sig('c1', 3));
    expect(seen).toEqual(['c1', 'c2', 'c3']);
  });

  it('forgets held signals after the TTL', () => {
    let now = 1000;
    const inbox = new P2PSignalInbox({ ttlMs: 20_000, now: () => now });
    inbox.receive(sig('old'));
    now += 25_000;
    const handler = vi.fn();
    inbox.attach('old', handler);
    expect(handler).not.toHaveBeenCalled();
  });

  it('bounds memory: oldest unclaimed call and per-call overflow are dropped', () => {
    const inbox = new P2PSignalInbox({ maxPendingCalls: 2, maxPerCall: 2 });
    inbox.receive(sig('a'));
    inbox.receive(sig('b'));
    inbox.receive(sig('c')); // evicts 'a'
    const a = vi.fn();
    inbox.attach('a', a);
    expect(a).not.toHaveBeenCalled();

    inbox.receive(sig('d', 1));
    inbox.receive(sig('d', 2));
    expect(inbox.receive(sig('d', 3))).toBe('dropped');
  });

  it('drops stragglers for a call that already ended, and re-opens on attach', () => {
    const inbox = new P2PSignalInbox();
    const detach = inbox.attach('c1', () => {});
    detach();
    expect(inbox.receive(sig('c1'))).toBe('dropped');
    const handler = vi.fn();
    inbox.attach('c1', handler); // e.g. StrictMode remount
    inbox.receive(sig('c1'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('a stale detach does not remove a newer handler', () => {
    const inbox = new P2PSignalInbox();
    const first = inbox.attach('c1', () => {});
    const handler = vi.fn();
    inbox.attach('c1', handler);
    first();
    inbox.receive(sig('c1'));
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
