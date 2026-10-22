import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import callSlice, {
  acceptIncomingCall,
  declineIncomingCall,
  endCall,
  setCallPhase,
  setIncomingCallToken,
} from '../roomStore/callSlice';
import { resetCallBroadcastForTests } from '../utils/callBroadcast';
import { silenceCallOutcome, startCallOutcomeSync } from './callOutcomeSync';
import { rememberCallDecision, resetCallClaims } from './callClaim';

// Two "tabs": two stores whose BroadcastChannel instances hear each other.
class FakeChannel {
  static all: FakeChannel[] = [];
  listeners = new Set<(e: { data: unknown }) => void>();
  constructor(public name: string) {
    FakeChannel.all.push(this);
  }
  postMessage(data: unknown) {
    FakeChannel.all
      .filter((c) => c !== this && c.name === this.name)
      .forEach((c) => c.listeners.forEach((l) => l({ data })));
  }
  addEventListener(_t: string, l: (e: { data: unknown }) => void) {
    this.listeners.add(l);
  }
  removeEventListener(_t: string, l: (e: { data: unknown }) => void) {
    this.listeners.delete(l);
  }
  close() {}
}

const makeTab = () => {
  const store = configureStore({
    reducer: { call: callSlice },
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  return store;
};

const ring = (store: ReturnType<typeof makeTab>, callId = 'c-1') =>
  store.dispatch(
    setIncomingCallToken({
      roomJid: 'app_a-app_b@conference.test',
      roomBareName: 'app_a-app_b',
      token: 'tok',
      kind: 'video',
      callId,
    })
  );

// The module keeps ONE channel per page. A second tab is simulated by a second
// channel object on the same bus that relays into the first one's listeners.
describe('callOutcomeSync', () => {
  let tabA: ReturnType<typeof makeTab>;
  let tabB: ReturnType<typeof makeTab>;
  let stopA: () => void;
  let outbound: any[];
  let relayToA: (data: unknown) => void;

  beforeEach(() => {
    FakeChannel.all = [];
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    resetCallBroadcastForTests();
    tabA = makeTab();
    tabB = makeTab();
    stopA = startCallOutcomeSync(tabA as any);
    // the real channel of this "page" (tab A) is the only FakeChannel so far
    const pageChannel = FakeChannel.all[0];
    outbound = [];
    const remote = new FakeChannel('ethora-call');
    remote.addEventListener('message', (e) => outbound.push(e.data));
    relayToA = (data) => remote.postMessage(data);
    void pageChannel;
  });
  afterEach(() => {
    stopA();
    resetCallClaims();
    resetCallBroadcastForTests();
    vi.unstubAllGlobals();
  });

  it('announces an answered ring', () => {
    ring(tabA);
    tabA.dispatch(acceptIncomingCall());
    expect(outbound).toEqual([expect.objectContaining({ key: 'c-1', outcome: 'accepted' })]);
  });

  it('sees an Answer that raises and accepts in the same tick', () => {
    ring(tabA);
    tabA.dispatch(acceptIncomingCall());
    expect(outbound).toHaveLength(1);
    expect(outbound[0].outcome).toBe('accepted');
  });

  it('announces a declined or cancelled ring as ended', () => {
    ring(tabA);
    tabA.dispatch(declineIncomingCall());
    ring(tabA, 'c-2');
    tabA.dispatch(endCall());
    expect(outbound.map((m) => [m.key, m.outcome])).toEqual([
      ['c-1', 'ended'],
      ['c-2', 'ended'],
    ]);
  });

  it('announces a ring that a different call replaced as ended', () => {
    ring(tabA, 'c-1');
    ring(tabA, 'c-2');
    expect(outbound.map((m) => [m.key, m.outcome])).toEqual([['c-1', 'ended']]);
  });

  it('does not announce a timeout (silenced), and only once', () => {
    ring(tabA);
    silenceCallOutcome('c-1');
    tabA.dispatch(declineIncomingCall());
    expect(outbound).toEqual([]);
    ring(tabA);
    tabA.dispatch(declineIncomingCall());
    expect(outbound).toHaveLength(1);
  });

  it('says nothing for things that are not a ring ending', () => {
    tabA.dispatch(endCall());
    ring(tabA);
    ring(tabA); // the same ring again changes nothing
    expect(outbound).toEqual([]);
  });

  it('ends a ring quietly when another tab says the call was taken', () => {
    ring(tabA);
    relayToA({ key: 'c-1', outcome: 'accepted', from: 'tab-b' });
    expect(tabA.getState().call.phase).toBe('idle');
    // no echo back to the other tab
    expect(outbound).toEqual([]);
  });

  it.each(['declined', 'ended'])('ends a ring quietly on %s from another tab', (outcome) => {
    ring(tabA);
    relayToA({ key: 'c-1', outcome, from: 'tab-b' });
    expect(tabA.getState().call.phase).toBe('idle');
    expect(outbound).toEqual([]);
  });

  it('leaves a different call, a call already connecting, and an outgoing call alone', () => {
    ring(tabA, 'c-2');
    relayToA({ key: 'c-1', outcome: 'accepted', from: 'tab-b' });
    expect(tabA.getState().call.phase).toBe('ringing-incoming');

    tabA.dispatch(acceptIncomingCall());
    outbound.length = 0;
    relayToA({ key: 'c-2', outcome: 'ended', from: 'tab-b' });
    expect(tabA.getState().call.phase).toBe('connecting');
  });

  describe('a tab that connected while another tab accepted the same call', () => {
    it('backs off quietly when it never took the per-call claim', () => {
      ring(tabA);
      tabA.dispatch(acceptIncomingCall());
      expect(tabA.getState().call.phase).toBe('connecting');
      outbound.length = 0;
      relayToA({ key: 'c-1', outcome: 'accepted', from: 'tab-b' });
      expect(tabA.getState().call.phase).toBe('idle');
      // nothing sent to the other tab or the caller from here
      expect(outbound).toEqual([]);
    });

    it('backs off from a call it is already in, too', () => {
      ring(tabA);
      tabA.dispatch(acceptIncomingCall());
      tabA.dispatch(setCallPhase('in-call'));
      relayToA({ key: 'c-1', outcome: 'accepted', from: 'tab-b' });
      expect(tabA.getState().call.phase).toBe('idle');
    });

    it('stays when it holds the claim itself', () => {
      ring(tabA);
      rememberCallDecision('c-1');
      tabA.dispatch(acceptIncomingCall());
      relayToA({ key: 'c-1', outcome: 'accepted', from: 'tab-b' });
      expect(tabA.getState().call.phase).toBe('connecting');
    });

    it('only an accepted outcome makes it back off, and only for its own call', () => {
      ring(tabA);
      tabA.dispatch(acceptIncomingCall());
      relayToA({ key: 'c-1', outcome: 'ended', from: 'tab-b' });
      relayToA({ key: 'c-1', outcome: 'declined', from: 'tab-b' });
      relayToA({ key: 'c-2', outcome: 'accepted', from: 'tab-b' });
      expect(tabA.getState().call.phase).toBe('connecting');
    });
  });

  it('works for a call without a callId (keyed by room)', () => {
    tabA.dispatch(
      setIncomingCallToken({ roomJid: 'app_a-app_b@conference.test', roomBareName: 'app_a-app_b', token: 't', kind: 'video' })
    );
    relayToA({ key: 'room:app_a-app_b', outcome: 'accepted', from: 'tab-b' });
    expect(tabA.getState().call.phase).toBe('idle');
  });

  it('stops listening when torn down', () => {
    stopA();
    ring(tabA);
    relayToA({ key: 'c-1', outcome: 'accepted', from: 'tab-b' });
    expect(tabA.getState().call.phase).toBe('ringing-incoming');
    tabA.dispatch(acceptIncomingCall());
    expect(outbound).toEqual([]);
    stopA = startCallOutcomeSync(tabA as any);
  });
});
