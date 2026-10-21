import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'ltx';
import { store } from '../../roomStore';
import { setUser } from '../../roomStore/chatSettingsSlice';
import {
  acquireP2PController,
  getActiveP2PController,
  handleP2PSignalStanza,
  p2pInbox,
  releaseP2PController,
  sendP2PSignal,
} from './p2pRuntime';
import { setGlobalXmppClient } from '../../utils/clientRegistry';
import { buildP2PSignalStanza } from './signalStanza';

const fakeController = () => ({ dispose: vi.fn() }) as any;

const incoming = (
  from: string,
  extra = '',
  payload = '{&quot;candidate&quot;:&quot;c1&quot;}'
) =>
  parse(
    `<message from='${from}/res' type='chat'>${extra}<data type='call-p2p' callId='call-1' signal='candidate' payload='${payload}'/></message>`
  );

describe('handleP2PSignalStanza', () => {
  beforeEach(() => {
    p2pInbox.clear();
    store.dispatch(setUser({ xmppUsername: 'me_1' } as any));
  });

  it('delivers a live signal from the peer to the attached call', () => {
    const handler = vi.fn();
    p2pInbox.attach('call-1', handler);
    handleP2PSignalStanza(incoming('peer_1@xmpp.example.com'));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      callId: 'call-1',
      signal: 'candidate',
      fromLocal: 'peer_1',
    });
  });

  it('holds it for a call nobody has claimed yet (offer racing the call-token)', () => {
    handleP2PSignalStanza(incoming('peer_1@xmpp.example.com'));
    const handler = vi.fn();
    p2pInbox.attach('call-1', handler);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('drops our own echo, replayed (delayed) and malformed signals', () => {
    const handler = vi.fn();
    p2pInbox.attach('call-1', handler);
    handleP2PSignalStanza(incoming('me_1@xmpp.example.com'));
    handleP2PSignalStanza(
      incoming('peer_1@xmpp.example.com', `<delay xmlns='urn:xmpp:delay' stamp='2020-01-01T00:00:00Z'/>`)
    );
    handleP2PSignalStanza(incoming('peer_1@xmpp.example.com', '', 'not json'));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('sendP2PSignal', () => {
  afterEach(() => setGlobalXmppClient(null));

  it('addresses the peer bare JID on the live client', () => {
    const send = vi.fn();
    setGlobalXmppClient({ host: 'xmpp.example.com', client: { send } } as any);
    const ok = sendP2PSignal({
      peerXmppUsername: 'peer_1',
      callId: 'call-1',
      signal: 'end',
      payload: { reason: 'hangup' },
    });
    expect(ok).toBe(true);
    const stanza = send.mock.calls[0][0];
    expect(stanza.attrs.to).toBe('peer_1@xmpp.example.com');
    expect(stanza.getChild('data').attrs.signal).toBe('end');
  });

  it('reports failure without a client or a peer instead of throwing', () => {
    setGlobalXmppClient(null);
    expect(
      sendP2PSignal({ peerXmppUsername: 'p', callId: 'c', signal: 'end', payload: {} })
    ).toBe(false);
    setGlobalXmppClient({ host: 'h', client: { send: vi.fn() } } as any);
    expect(
      sendP2PSignal({ peerXmppUsername: '', callId: 'c', signal: 'end', payload: {} })
    ).toBe(false);
    // The stanza builder itself is exercised in signalStanza.test.ts.
    expect(buildP2PSignalStanza).toBeTypeOf('function');
  });
});

describe('controller registry (deferred dispose)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    // Settle anything a test left behind, then restore real timers.
    releaseP2PController('k1');
    releaseP2PController('k2');
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('release then immediate re-acquire (effect remount) keeps the SAME controller alive', () => {
    const create = vi.fn(fakeController);
    const a = acquireP2PController('k1', create);
    releaseP2PController('k1');
    const b = acquireP2PController('k1', create);
    vi.runAllTimers();
    expect(b).toBe(a);
    expect(create).toHaveBeenCalledTimes(1);
    expect(a.dispose).not.toHaveBeenCalled();
    expect(getActiveP2PController()).toBe(a);
  });

  it('release disposes after a tick and clears the active controller', () => {
    const a = acquireP2PController('k1', fakeController);
    releaseP2PController('k1');
    expect(a.dispose).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(getActiveP2PController()).toBeNull();
  });

  it('a different call replaces and disposes the previous controller', () => {
    const a = acquireP2PController('k1', fakeController);
    const b = acquireP2PController('k2', fakeController);
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(getActiveP2PController()).toBe(b);
  });

  it('releasing a key that is not active is a no-op', () => {
    const a = acquireP2PController('k1', fakeController);
    releaseP2PController('other');
    vi.runAllTimers();
    expect(a.dispose).not.toHaveBeenCalled();
  });
});
