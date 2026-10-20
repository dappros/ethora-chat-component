import { describe, expect, it } from 'vitest';
import reducer, {
  setIncomingCallToken,
  setOutgoingCallRoute,
  startOutgoingCall,
  endCall,
  CallState,
} from './callSlice';

const dial = (isGroup = false): CallState =>
  reducer(
    undefined,
    startOutgoingCall({
      roomJid: 'room@conference.x',
      roomName: 'Room',
      kind: 'video',
      peerXmppUsername: isGroup ? null : 'peer',
      isGroup,
    })
  );

describe('call slice transport routing', () => {
  it('a fresh call defaults to livekit, 1:1', () => {
    const s = dial();
    expect(s).toMatchObject({ mode: 'livekit', isGroup: false, iceServers: null });
  });

  it('a group dial is marked as a group call', () => {
    expect(dial(true).isGroup).toBe(true);
  });

  it('applies a p2p route only to the call that asked', () => {
    const s = dial();
    const routed = reducer(
      s,
      setOutgoingCallRoute({
        startedAt: s.startedAt,
        callId: 'c1',
        mode: 'p2p',
        iceServers: [{ urls: 'stun:s' }],
      })
    );
    expect(routed).toMatchObject({
      mode: 'p2p',
      callId: 'c1',
      phase: 'requesting',
      iceServers: [{ urls: 'stun:s' }],
    });

    const stale = reducer(
      s,
      setOutgoingCallRoute({
        startedAt: (s.startedAt || 0) - 1,
        callId: 'old',
        mode: 'p2p',
        iceServers: [],
      })
    );
    expect(stale.mode).toBe('livekit');
    expect(stale.callId).toBeNull();
  });

  it('ignores a route once the call is gone', () => {
    const s = dial();
    const idle = reducer(s, endCall());
    expect(
      reducer(
        idle,
        setOutgoingCallRoute({ startedAt: s.startedAt, callId: 'c', mode: 'p2p', iceServers: [] })
      )
    ).toEqual(idle);
  });

  it('a livekit route carries group and the server livekitUrl, and may land after the token', () => {
    const s = dial();
    const connecting = { ...s, phase: 'connecting' as const };
    const routed = reducer(
      connecting,
      setOutgoingCallRoute({
        startedAt: s.startedAt,
        callId: 'c2',
        mode: 'livekit',
        group: true,
        livekitUrl: 'wss://lk.example.com',
      })
    );
    expect(routed).toMatchObject({
      mode: 'livekit',
      isGroup: true,
      livekitUrl: 'wss://lk.example.com',
      callId: 'c2',
    });
    // ...but a p2p route can no longer be applied once connecting.
    expect(
      reducer(
        connecting,
        setOutgoingCallRoute({ startedAt: s.startedAt, callId: 'c3', mode: 'p2p', iceServers: [] })
      ).mode
    ).toBe('livekit');
  });

  it('never keeps a raw chat name as the call name', () => {
    const raw =
      '69c24e911e53d44d2b6c4bbc_69c2517a239cee5defaf52d6-69c24e911e53d44d2b6c4bbc_69c251a0239cee5defaf5343';
    expect(
      reducer(undefined, setIncomingCallToken({ roomJid: 'r@c.x', token: 't', roomName: raw }))
        .roomName
    ).toBeNull();
    expect(
      reducer(
        undefined,
        startOutgoingCall({ roomJid: 'r@c.x', roomName: raw, peerXmppUsername: 'p' })
      ).roomName
    ).toBeNull();
    expect(
      reducer(
        undefined,
        setIncomingCallToken({
          roomJid: 'r@c.x',
          token: 't',
          roomName: ' Ann\u0000 B ',
          callerName: 'Ann B',
          callerXmppUsername: 'u_1',
        })
      )
    ).toMatchObject({ roomName: 'Ann B', callerName: 'Ann B', callerXmppUsername: 'u_1' });
  });

  it('an incoming token carries mode, group and ice servers', () => {
    const p2p = reducer(
      undefined,
      setIncomingCallToken({
        roomJid: 'a-b@conference.x',
        token: '',
        mode: 'p2p',
        iceServers: [{ urls: 'turn:t' }],
        callId: 'c',
      })
    );
    expect(p2p).toMatchObject({ mode: 'p2p', isGroup: false, iceServers: [{ urls: 'turn:t' }] });

    const group = reducer(
      undefined,
      setIncomingCallToken({ roomJid: 'g@conference.x', token: 't', isGroup: true })
    );
    expect(group).toMatchObject({ mode: 'livekit', isGroup: true, iceServers: null });

    const legacy = reducer(
      undefined,
      setIncomingCallToken({ roomJid: 'r@conference.x', token: 't' })
    );
    expect(legacy).toMatchObject({ mode: 'livekit', isGroup: false });
  });
});
