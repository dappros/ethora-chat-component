import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createChatCall, reportCallEnded, sendCallStateSignal } = vi.hoisted(
  () => ({
    createChatCall: vi.fn(),
    reportCallEnded: vi.fn(),
    sendCallStateSignal: vi.fn(),
  })
);
vi.mock('../networking/api-requests/rooms.api', () => ({ createChatCall }));
vi.mock('../networking/api-requests/callState.api', () => ({ reportCallEnded }));
vi.mock('../networking/callTokenStanza', () => ({ sendCallStateSignal }));

import { store } from '../roomStore';
import { endCall, startOutgoingCall } from '../roomStore/callSlice';
import { requestOutgoingCall } from './startCall';

const dial = (peer: string | null = 'peer', isGroup = false) =>
  store.dispatch(
    startOutgoingCall({
      roomJid: 'room@conference.x',
      roomBareName: 'room',
      kind: 'video',
      peerXmppUsername: peer,
      isGroup,
    })
  );

const result = (over: Record<string, unknown> = {}) => ({
  callId: 'c1',
  mode: 'livekit',
  kind: 'video',
  group: null,
  livekitUrl: null,
  iceServers: [],
  ttlSeconds: null,
  ...over,
});

describe('requestOutgoingCall', () => {
  beforeEach(() => {
    store.dispatch(endCall());
    createChatCall.mockReset();
    reportCallEnded.mockReset();
    sendCallStateSignal.mockReset();
  });

  it('1:1 p2p answer: routes the call to p2p with the ICE servers', async () => {
    dial();
    createChatCall.mockResolvedValue(
      result({
        mode: 'p2p',
        iceServers: [{ urls: 'stun:s.example.com' }],
      })
    );
    await requestOutgoingCall({ chatName: 'room', kind: 'video', peerXmppUsername: 'peer' });
    expect(createChatCall).toHaveBeenCalledWith('room', { kind: 'video' });
    expect(store.getState().call).toMatchObject({
      mode: 'p2p',
      callId: 'c1',
      phase: 'requesting',
      iceServers: [{ urls: 'stun:s.example.com' }],
    });
  });

  it('1:1 livekit fallback: stays on the legacy path and waits for its own call-token', async () => {
    dial();
    createChatCall.mockResolvedValue(result({ livekitUrl: 'wss://lk.example.com' }));
    await requestOutgoingCall({ chatName: 'room', kind: 'video', peerXmppUsername: 'peer' });
    expect(store.getState().call).toMatchObject({
      mode: 'livekit',
      isGroup: false,
      phase: 'requesting',
      token: null,
      livekitUrl: 'wss://lk.example.com',
      iceServers: null,
    });
  });

  it('group: livekit with the group flag, no peer', async () => {
    dial(null, true);
    createChatCall.mockResolvedValue(result({ group: true }));
    await requestOutgoingCall({ chatName: 'room', kind: 'video', peerXmppUsername: null });
    expect(store.getState().call).toMatchObject({
      mode: 'livekit',
      isGroup: true,
      peerXmppUsername: null,
    });
  });

  it('an old server (no group field) keeps the flag the dialer set', async () => {
    dial(null, true);
    createChatCall.mockResolvedValue(result({ group: null }));
    await requestOutgoingCall({ chatName: 'room', kind: 'video', peerXmppUsername: null });
    expect(store.getState().call.isGroup).toBe(true);
  });

  it('a p2p answer that lands after the user cancelled is torn down on the server and the peer', async () => {
    dial();
    let resolve: (v: unknown) => void = () => {};
    createChatCall.mockReturnValue(new Promise((r) => (resolve = r)));
    const pending = requestOutgoingCall({
      chatName: 'room',
      kind: 'video',
      peerXmppUsername: 'peer',
    });
    store.dispatch(endCall()); // user hit cancel before the response
    resolve(result({ callId: 'late', mode: 'p2p' }));
    await pending;

    expect(store.getState().call.phase).toBe('idle');
    expect(reportCallEnded).toHaveBeenCalledWith('late');
    expect(sendCallStateSignal).toHaveBeenCalledWith('cancelled', {
      peerXmppUsername: 'peer',
      callId: 'late',
      roomBareName: 'room',
    });
  });

  it('a stale answer for an earlier call does not leak into the next one', async () => {
    dial();
    let resolve: (v: unknown) => void = () => {};
    createChatCall.mockReturnValue(new Promise((r) => (resolve = r)));
    const pending = requestOutgoingCall({
      chatName: 'room',
      kind: 'video',
      peerXmppUsername: 'peer',
    });
    store.dispatch(endCall());
    await new Promise((r) => setTimeout(r, 2)); // distinct startedAt
    dial();
    resolve(result({ callId: 'old', mode: 'p2p' }));
    await pending;
    expect(store.getState().call.mode).toBe('livekit');
    expect(store.getState().call.callId).toBeNull();
  });

  it('propagates a failed request so the dial screen can show the error', async () => {
    dial();
    createChatCall.mockRejectedValue(new Error('Error creating chat call'));
    await expect(
      requestOutgoingCall({ chatName: 'room', kind: 'video', peerXmppUsername: 'peer' })
    ).rejects.toThrow('Error creating chat call');
  });
});
