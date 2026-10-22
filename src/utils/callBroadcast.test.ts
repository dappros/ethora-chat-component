import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CALL_OUTCOME_STORAGE_KEY,
  broadcastCallOutcome,
  resetCallBroadcastForTests,
  subscribeCallOutcomes,
} from './callBroadcast';
import { isCallHandled, resetHandledCalls } from './handledCalls';

// A BroadcastChannel bus: every instance of a name hears every other instance,
// never itself (like the real one).
class FakeChannel {
  static all: FakeChannel[] = [];
  listeners = new Set<(e: { data: unknown }) => void>();
  closed = false;
  constructor(public name: string) {
    FakeChannel.all.push(this);
  }
  postMessage(data: unknown) {
    FakeChannel.all
      .filter((c) => c !== this && c.name === this.name && !c.closed)
      .forEach((c) => c.listeners.forEach((l) => l({ data })));
  }
  addEventListener(_t: string, l: (e: { data: unknown }) => void) {
    this.listeners.add(l);
  }
  removeEventListener(_t: string, l: (e: { data: unknown }) => void) {
    this.listeners.delete(l);
  }
  close() {
    this.closed = true;
  }
}

describe('callBroadcast', () => {
  beforeEach(() => {
    FakeChannel.all = [];
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    resetCallBroadcastForTests();
  });
  afterEach(() => {
    resetCallBroadcastForTests();
    vi.unstubAllGlobals();
  });

  it('sends the outcome on the ethora-call channel', () => {
    const other = new FakeChannel('ethora-call');
    const heard = vi.fn();
    other.addEventListener('message', (e) => heard(e.data));
    broadcastCallOutcome('c-1', 'accepted');
    expect(heard).toHaveBeenCalledWith(expect.objectContaining({ key: 'c-1', outcome: 'accepted' }));
  });

  it('delivers another tab\'s outcome to subscribers, and stops after unsubscribe', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeCallOutcomes(callback);
    const other = new FakeChannel('ethora-call');
    other.postMessage({ key: 'c-1', outcome: 'declined', from: 'someone-else' });
    expect(callback).toHaveBeenCalledWith({ key: 'c-1', outcome: 'declined' });
    unsubscribe();
    other.postMessage({ key: 'c-2', outcome: 'ended', from: 'someone-else' });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('ignores messages of this tab, other channels and malformed data', () => {
    const callback = vi.fn();
    subscribeCallOutcomes(callback);
    let own = '';
    const probe = new FakeChannel('ethora-call');
    probe.addEventListener('message', (e: any) => {
      if (e.data?.from) own = e.data.from;
    });
    broadcastCallOutcome('c-1', 'accepted');
    const other = new FakeChannel('ethora-call');
    other.postMessage({ key: 'c-1', outcome: 'accepted', from: own });
    new FakeChannel('something-else').postMessage({ key: 'c-1', outcome: 'accepted', from: 'x' });
    other.postMessage(null);
    other.postMessage({ outcome: 'ended', from: 'x' });
    other.postMessage({ key: '', outcome: 'ended', from: 'x' });
    expect(callback).not.toHaveBeenCalled();
  });

  it('sends nothing without a key', () => {
    const other = new FakeChannel('ethora-call');
    const heard = vi.fn();
    other.addEventListener('message', heard);
    broadcastCallOutcome('', 'accepted');
    broadcastCallOutcome(null, 'accepted');
    expect(heard).not.toHaveBeenCalled();
  });

  it('is a no-op where BroadcastChannel does not exist', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    resetCallBroadcastForTests();
    expect(() => broadcastCallOutcome('c-1', 'accepted')).not.toThrow();
    const unsubscribe = subscribeCallOutcomes(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });

  it('survives a channel that throws', () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('nope');
        }
      }
    );
    resetCallBroadcastForTests();
    expect(() => broadcastCallOutcome('c-1', 'accepted')).not.toThrow();
  });

  it('marks the call handled for later pushes and replays, here and for what it hears', () => {
    resetHandledCalls();
    broadcastCallOutcome('c-1', 'declined');
    expect(isCallHandled('c-1')).toBe(true);
    resetHandledCalls();
    subscribeCallOutcomes(() => {});
    new FakeChannel('ethora-call').postMessage({ key: 'c-2', outcome: 'accepted', from: 'x' });
    expect(isCallHandled('c-2')).toBe(true);
  });
});

// No BroadcastChannel: the outcome goes through a localStorage write, which the
// `storage` event delivers to every other tab.
describe('callBroadcast without BroadcastChannel (storage fallback)', () => {
  beforeEach(() => {
    vi.stubGlobal('BroadcastChannel', undefined);
    resetCallBroadcastForTests();
    localStorage.clear();
    resetHandledCalls();
  });
  afterEach(() => {
    resetCallBroadcastForTests();
    vi.unstubAllGlobals();
  });

  const storageEvent = (newValue: string | null, key = CALL_OUTCOME_STORAGE_KEY) =>
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));

  it('writes the outcome to localStorage, call key only', () => {
    broadcastCallOutcome('c-1', 'accepted');
    const written = JSON.parse(localStorage.getItem(CALL_OUTCOME_STORAGE_KEY) || 'null');
    expect(written).toMatchObject({ key: 'c-1', outcome: 'accepted' });
    expect(Object.keys(written).sort()).toEqual(['at', 'from', 'key', 'n', 'outcome']);
  });

  it('every write is a new value, so a repeated outcome still fires the event', () => {
    broadcastCallOutcome('c-1', 'ended');
    const first = localStorage.getItem(CALL_OUTCOME_STORAGE_KEY);
    broadcastCallOutcome('c-1', 'ended');
    expect(localStorage.getItem(CALL_OUTCOME_STORAGE_KEY)).not.toBe(first);
  });

  it('delivers another tab\'s write to subscribers, and stops after unsubscribe', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeCallOutcomes(callback);
    storageEvent(JSON.stringify({ key: 'c-1', outcome: 'declined', from: 'tab-b', n: 1 }));
    expect(callback).toHaveBeenCalledWith({ key: 'c-1', outcome: 'declined' });
    expect(isCallHandled('c-1')).toBe(true);
    unsubscribe();
    storageEvent(JSON.stringify({ key: 'c-2', outcome: 'ended', from: 'tab-b', n: 2 }));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('ignores its own write, other storage keys, removals and junk', () => {
    const callback = vi.fn();
    subscribeCallOutcomes(callback);
    broadcastCallOutcome('c-1', 'accepted');
    const own = localStorage.getItem(CALL_OUTCOME_STORAGE_KEY) as string;
    storageEvent(own);
    storageEvent(JSON.stringify({ key: 'c-2', outcome: 'ended', from: 'x' }), 'something-else');
    storageEvent(null);
    storageEvent('{not json');
    storageEvent(JSON.stringify({ outcome: 'ended', from: 'x' }));
    expect(callback).not.toHaveBeenCalled();
  });

  it('a tab that has the channel and one that has not still hear each other: both routes, acted on once', () => {
    // sender side: has a channel and storage, so it writes both
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    resetCallBroadcastForTests();
    const heard: any[] = [];
    const probe = new FakeChannel('ethora-call');
    probe.addEventListener('message', (e: any) => heard.push(e.data));
    broadcastCallOutcome('c-1', 'accepted');
    expect(heard).toEqual([expect.objectContaining({ key: 'c-1', outcome: 'accepted' })]);
    const written = localStorage.getItem(CALL_OUTCOME_STORAGE_KEY) as string;
    expect(JSON.parse(written)).toMatchObject({ key: 'c-1', outcome: 'accepted' });

    // receiver side: a tab with a channel hears the same message on both routes
    const receiver = vi.fn();
    subscribeCallOutcomes(receiver);
    const message = { key: 'c-2', outcome: 'ended', from: 'tab-x', n: 7 };
    new FakeChannel('ethora-call').postMessage(message);
    storageEvent(JSON.stringify(message));
    expect(receiver).toHaveBeenCalledTimes(1);
    // a later message from the same tab is a new one
    storageEvent(JSON.stringify({ ...message, n: 8 }));
    expect(receiver).toHaveBeenCalledTimes(2);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => broadcastCallOutcome('c-1', 'accepted')).not.toThrow();
    vi.restoreAllMocks();
  });

  it('end to end: a ring in another tab ends when this tab hears the write', async () => {
    const { startCallOutcomeSync } = await import('../helpers/callOutcomeSync');
    const { configureStore } = await import('@reduxjs/toolkit');
    const { default: callSlice, setIncomingCallToken } = await import('../roomStore/callSlice');
    const tab = configureStore({
      reducer: { call: callSlice },
      middleware: (d) => d({ serializableCheck: false, immutableCheck: false }),
    });
    const stop = startCallOutcomeSync(tab as any);
    tab.dispatch(
      setIncomingCallToken({ roomJid: 'r@c', roomBareName: 'r', token: 't', kind: 'video', callId: 'c-1' })
    );
    storageEvent(JSON.stringify({ key: 'c-1', outcome: 'accepted', from: 'tab-b', n: 1 }));
    expect(tab.getState().call.phase).toBe('idle');
    stop();
  });
});
