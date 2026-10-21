import { describe, expect, it } from 'vitest';
import { P2PNegotiator } from './negotiator';
import type { P2PSignal } from './signalStanza';

const sdp = (n: number) => `v=0\r\no=- ${n} 2 IN IP4 0.0.0.0\r\n`;

const offer = (n: number, from = 'alice', callId = 'c1'): P2PSignal => ({
  callId,
  signal: 'offer',
  payload: { type: 'offer', sdp: sdp(n) },
  fromBare: `${from}@x`,
  fromLocal: from,
  ageMs: null,
  delayed: false,
});
const answer = (n: number, from = 'bob'): P2PSignal => ({
  ...offer(n, from),
  signal: 'answer',
  payload: { type: 'answer', sdp: sdp(n) },
});
const cand = (n: number, from = 'alice'): P2PSignal => ({
  ...offer(0, from),
  signal: 'candidate',
  payload: { candidate: `candidate:${n}`, sdpMid: '0', sdpMLineIndex: 0 },
});
const end = (from = 'alice', reason = 'hangup'): P2PSignal => ({
  ...offer(0, from),
  signal: 'end',
  payload: { reason },
});

const callee = () =>
  new P2PNegotiator({ callId: 'c1', role: 'callee', peerLocal: 'alice' });
const caller = () =>
  new P2PNegotiator({ callId: 'c1', role: 'caller', peerLocal: 'bob' });

describe('callee: signals before the user accepts', () => {
  it('holds the offer and candidates until ready, then releases them in order', () => {
    const n = callee();
    expect(n.receive(offer(1))).toEqual([]);
    expect(n.receive(cand(1))).toEqual([]);
    expect(n.receive(cand(2))).toEqual([]);

    expect(n.markReady()).toEqual([
      { type: 'apply-offer', sdp: sdp(1), initial: true, rollback: false },
    ]);
    const flushed = n.markRemoteApplied();
    expect(flushed.map((c) => c.type)).toEqual(['add-candidate', 'add-candidate']);
    expect((flushed[0] as any).candidate.candidate).toBe('candidate:1');
  });

  it('first offer wins: a different later offer and a duplicate are ignored', () => {
    const n = callee();
    expect(n.receive(offer(1))).toEqual([]);
    expect(n.receive(offer(2))).toEqual([]);
    expect(n.receive(offer(1))).toEqual([]);
    const ready = n.markReady();
    expect(ready).toHaveLength(1);
    expect((ready[0] as any).sdp).toBe(sdp(1));
    expect(n.markReady()).toEqual([]);
  });

  it('applies the offer immediately if it arrives after ready', () => {
    const n = callee();
    n.markReady();
    expect(n.receive(offer(1))).toEqual([
      { type: 'apply-offer', sdp: sdp(1), initial: true, rollback: false },
    ]);
  });

  it('applies candidates directly once the remote description is set, deduplicated', () => {
    const n = callee();
    n.receive(offer(1));
    n.markReady();
    n.markRemoteApplied();
    expect(n.receive(cand(1))).toHaveLength(1);
    expect(n.receive(cand(1))).toEqual([]);
  });
});

describe('filtering', () => {
  it('ignores other callIds, other senders and the end-of-candidates marker', () => {
    const n = callee();
    n.markReady();
    expect(n.receive(offer(1, 'alice', 'other-call'))).toEqual([]);
    expect(n.receive(offer(1, 'mallory'))).toEqual([]);
    n.receive(offer(1));
    n.markRemoteApplied();
    expect(
      n.receive({ ...cand(1), payload: { candidate: '' } } as P2PSignal)
    ).toEqual([]);
  });

  it('a caller never accepts an initial offer', () => {
    const n = caller();
    n.markReady();
    expect(n.receive(offer(1, 'bob'))).toEqual([]);
  });

  it('end reports once and silences everything after it', () => {
    const n = callee();
    expect(n.receive(end('alice', 'declined'))).toEqual([
      { type: 'remote-end', reason: 'declined' },
    ]);
    expect(n.isEnded).toBe(true);
    expect(n.receive(end())).toEqual([]);
    expect(n.receive(offer(1))).toEqual([]);
    expect(n.markReady()).toEqual([]);
  });

  it('an end before the offer drops the held offer', () => {
    const n = callee();
    n.receive(offer(1));
    n.receive(end());
    expect(n.markReady()).toEqual([]);
  });
});

describe('caller: answer handling', () => {
  it('applies the answer once and only when an offer is pending', () => {
    const n = caller();
    n.markReady();
    expect(n.receive(answer(1))).toEqual([]);
    n.markLocalOffer();
    expect(n.awaitingAnswer).toBe(true);
    expect(n.receive(answer(1))).toEqual([{ type: 'apply-answer', sdp: sdp(1) }]);
    expect(n.awaitingAnswer).toBe(false);
    expect(n.receive(answer(1))).toEqual([]);
  });

  it('holds callee candidates until the answer is applied', () => {
    const n = caller();
    n.markReady();
    n.markLocalOffer();
    expect(n.receive(cand(1, 'bob'))).toEqual([]);
    n.receive(answer(1));
    expect(n.markRemoteApplied()).toHaveLength(1);
  });
});

describe('renegotiation and glare (ICE restart from both sides)', () => {
  const connected = (n: P2PNegotiator, callerSide: boolean) => {
    n.markReady();
    if (callerSide) {
      n.markLocalOffer();
      n.receive(answer(1));
    } else {
      n.receive(offer(1));
    }
    n.markRemoteApplied();
  };

  it('a new offer after the exchange is a renegotiation', () => {
    const n = callee();
    connected(n, false);
    expect(n.receive(offer(2))).toEqual([
      { type: 'apply-offer', sdp: sdp(2), initial: false, rollback: false },
    ]);
    // Re-delivery of the same restart offer is a no-op.
    expect(n.receive(offer(2))).toEqual([]);
  });

  it('the caller also accepts a restart offer from the callee', () => {
    const n = caller();
    connected(n, true);
    expect(n.receive(offer(5, 'bob'))).toEqual([
      { type: 'apply-offer', sdp: sdp(5), initial: false, rollback: false },
    ]);
  });

  it('glare: the caller keeps its own offer, the callee rolls back and yields', () => {
    const c = caller();
    connected(c, true);
    c.markLocalOffer(); // caller restarts
    expect(c.receive(offer(7, 'bob'))).toEqual([]); // impolite: ignore theirs

    const b = callee();
    connected(b, false);
    b.markLocalOffer(); // callee restarts at the same moment
    expect(b.receive(offer(8))).toEqual([
      { type: 'apply-offer', sdp: sdp(8), initial: false, rollback: true },
    ]);
    expect(b.awaitingAnswer).toBe(false);
  });
});
