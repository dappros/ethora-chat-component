import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { Provider } from 'react-redux';

const h = vi.hoisted(() => ({
  instances: [] as any[],
  reports: {
    ringing: vi.fn(),
    connected: vi.fn(),
    ended: vi.fn(),
    declined: vi.fn(),
  },
}));

vi.mock('../../calls/p2p/P2PCallController', async () => {
  const actual = await vi.importActual<any>('../../calls/p2p/P2PCallController');
  class FakeController {
    started = false;
    disposed = false;
    signals: any[] = [];
    start = vi.fn(async () => {
      this.started = true;
    });
    receive = vi.fn((s: any) => this.signals.push(s));
    dispose = vi.fn(() => {
      if (this.disposed) return;
      this.disposed = true;
      this.events.onDisposed?.({ started: this.started });
    });
    constructor(
      public params: any,
      public deps: any,
      public events: any
    ) {
      h.instances.push(this);
    }
  }
  return { ...actual, P2PCallController: FakeController };
});
vi.mock('../../networking/api-requests/callState.api', () => ({
  reportCallRinging: h.reports.ringing,
  reportCallConnected: h.reports.connected,
  reportCallEnded: h.reports.ended,
  reportCallDeclined: h.reports.declined,
  fetchIceServers: vi.fn(),
}));

import { store } from '../../roomStore';
import { setConfig } from '../../roomStore/chatSettingsSlice';
import {
  acceptIncomingCall,
  endCall,
  setIncomingCallToken,
  setOutgoingCallRoute,
  startOutgoingCall,
} from '../../roomStore/callSlice';
import { getActiveP2PController, p2pInbox } from '../../calls/p2p/p2pRuntime';
import { P2PCallRunner } from './P2PCallRunner';

const call = () => store.getState().call;
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });

const mount = () =>
  render(
    <Provider store={store}>
      <P2PCallRunner />
    </Provider>
  );

describe('P2PCallRunner', () => {
  beforeEach(() => {
    h.instances.length = 0;
    Object.values(h.reports).forEach((m) => m.mockClear());
    p2pInbox.clear();
    store.dispatch(endCall());
    store.dispatch(setConfig({ videoCalls: { enabled: true, livekitUrl: 'wss://lk' } } as any));
  });
  afterEach(async () => {
    act(() => {
      store.dispatch(endCall());
    });
    await tick();
  });

  const ringIncoming = (over: Record<string, unknown> = {}) =>
    store.dispatch(
      setIncomingCallToken({
        roomJid: 'a-b@conference.x',
        roomBareName: 'a-b',
        token: '',
        callId: 'c1',
        kind: 'audio',
        mode: 'p2p',
        peerXmppUsername: 'b',
        iceServers: [{ urls: 'stun:s' }],
        ...over,
      })
    );

  it('does nothing for a LiveKit call', async () => {
    mount();
    act(() => {
      store.dispatch(setIncomingCallToken({ roomJid: 'r@c.x', token: 't', callId: 'l1' }));
    });
    await tick();
    expect(h.instances).toHaveLength(0);
  });

  it('callee: builds the controller while ringing (to catch the offer), starts it only on accept', async () => {
    mount();
    act(() => {
      ringIncoming();
    });
    await tick();
    expect(h.instances).toHaveLength(1);
    const c = h.instances[0];
    expect(c.params).toMatchObject({
      callId: 'c1',
      role: 'callee',
      kind: 'audio',
      peerLocal: 'b',
      iceServers: [{ urls: 'stun:s' }],
    });
    expect(c.start).not.toHaveBeenCalled();
    expect(getActiveP2PController()).toBe(c);
    expect(h.reports.ringing).toHaveBeenCalledWith('c1');
    expect(h.reports.ringing).toHaveBeenCalledTimes(1);

    // Signals that arrive while ringing reach the same controller.
    p2pInbox.receive({ callId: 'c1', signal: 'end', payload: {}, fromBare: 'b@x', fromLocal: 'b', ageMs: null, delayed: false });
    expect(c.receive).toHaveBeenCalledTimes(1);

    act(() => {
      store.dispatch(acceptIncomingCall());
    });
    await tick();
    expect(h.instances).toHaveLength(1); // same controller, not a second one
    expect(c.start).toHaveBeenCalledTimes(1);
    expect(c.disposed).toBe(false);
  });

  it('callee decline / ring ended: disposes without reporting an end', async () => {
    mount();
    act(() => {
      ringIncoming();
    });
    await tick();
    act(() => {
      store.dispatch(endCall());
    });
    await tick();
    const c = h.instances[0];
    expect(c.dispose).toHaveBeenCalled();
    expect(h.reports.ended).not.toHaveBeenCalled();
    expect(getActiveP2PController()).toBeNull();
  });

  it('caller: starts as soon as the create response routes the call to p2p', async () => {
    mount();
    act(() => {
      store.dispatch(
        startOutgoingCall({ roomJid: 'a-b@conference.x', roomBareName: 'a-b', kind: 'video', peerXmppUsername: 'b' })
      );
    });
    await tick();
    expect(h.instances).toHaveLength(0); // still dialling, transport unknown

    act(() => {
      store.dispatch(
        setOutgoingCallRoute({ startedAt: call().startedAt, callId: 'c2', mode: 'p2p', iceServers: [{ urls: 'stun:s' }] })
      );
    });
    await tick();
    expect(h.instances).toHaveLength(1);
    expect(h.instances[0].params).toMatchObject({ role: 'caller', callId: 'c2', kind: 'video' });
    expect(h.instances[0].start).toHaveBeenCalledTimes(1);
  });

  it('maps controller events onto the call state and reports to the server', async () => {
    mount();
    act(() => {
      store.dispatch(
        startOutgoingCall({ roomJid: 'a-b@conference.x', roomBareName: 'a-b', kind: 'video', peerXmppUsername: 'b' })
      );
      store.dispatch(
        setOutgoingCallRoute({ startedAt: call().startedAt, callId: 'c3', mode: 'p2p', iceServers: [] })
      );
    });
    await tick();
    const c = h.instances[0];

    act(() => c.events.onNegotiated());
    expect(call().phase).toBe('connecting');

    act(() => c.events.onConnected());
    expect(call().phase).toBe('in-call');
    expect(h.reports.connected).toHaveBeenCalledWith('c3');

    act(() => c.events.onRemoteEnd('hangup'));
    expect(call().phase).toBe('idle');
  });

  it('a failure ends in the error phase with the message, and the end is reported', async () => {
    mount();
    act(() => {
      ringIncoming();
      store.dispatch(acceptIncomingCall());
    });
    await tick();
    const c = h.instances[0];
    act(() => c.events.onFailed('Camera or microphone permission denied'));
    expect(call()).toMatchObject({
      phase: 'error',
      error: 'Camera or microphone permission denied',
    });
    await tick();
    expect(c.dispose).toHaveBeenCalled();
    expect(h.reports.ended).toHaveBeenCalledWith('c1');
  });

  it('a peer-side media failure surfaces as an error, a plain hang up just closes', async () => {
    mount();
    act(() => {
      ringIncoming();
      store.dispatch(acceptIncomingCall());
    });
    await tick();
    act(() => h.instances[0].events.onRemoteEnd('media-error'));
    expect(call().phase).toBe('error');
    expect(call().error).toMatch(/camera or microphone/i);
  });

  it('ignores late events of a call that is no longer the current one', async () => {
    mount();
    act(() => {
      ringIncoming();
      store.dispatch(acceptIncomingCall());
    });
    await tick();
    const c = h.instances[0];
    act(() => {
      store.dispatch(endCall());
    });
    act(() => {
      ringIncoming({ callId: 'c-next' });
    });
    act(() => c.events.onFailed('late failure of the old call'));
    expect(call()).toMatchObject({ phase: 'ringing-incoming', callId: 'c-next' });
    act(() => c.events.onConnected());
    expect(call().phase).toBe('ringing-incoming');
  });

  it('unmounting releases the controller', async () => {
    const view = mount();
    act(() => {
      ringIncoming();
      store.dispatch(acceptIncomingCall());
    });
    await tick();
    const c = h.instances[0];
    view.unmount();
    await tick();
    expect(c.dispose).toHaveBeenCalled();
    expect(h.reports.ended).toHaveBeenCalledWith('c1');
  });

  it('a call without a known peer errors instead of hanging', async () => {
    mount();
    act(() => {
      ringIncoming({ peerXmppUsername: null });
    });
    await tick();
    expect(call()).toMatchObject({ phase: 'error', error: 'Cannot reach the other participant' });
    expect(h.instances).toHaveLength(0);
  });
});
