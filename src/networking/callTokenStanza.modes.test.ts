import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'ltx';

const { reportCallDeclined, reportCallEnded } = vi.hoisted(() => ({
  reportCallDeclined: vi.fn(),
  reportCallEnded: vi.fn(),
}));
vi.mock('./api-requests/callState.api', () => ({
  reportCallDeclined,
  reportCallEnded,
  reportCallRinging: vi.fn(),
  reportCallConnected: vi.fn(),
  fetchIceServers: vi.fn(),
}));

import { store } from '../roomStore';
import { addRoom } from '../roomStore/roomsSlice';
import { setConfig, setUser } from '../roomStore/chatSettingsSlice';
import {
  resetCall,
  setIncomingCallToken,
  startOutgoingCall,
  setOutgoingCallRoute,
} from '../roomStore/callSlice';
import { p2pInbox } from '../calls/p2p/p2pRuntime';
import { onCallTokenMessage } from './callTokenStanza';
import { IRoom } from '../types/types';

const DM_ROOM = 'app_a-app_b';
const DM_JID = `${DM_ROOM}@conference.xmpp.example.com`;
const GROUP_ROOM = 'app_group-uuid';
const GROUP_JID = `${GROUP_ROOM}@conference.xmpp.example.com`;
const ICE = [{ urls: 'turn:t.example.com', username: 'u', credential: 'p' }];

const tokenStanza = (attrs: Record<string, string>) => {
  const rendered = Object.entries(attrs)
    .map(([k, v]) => `${k}='${v.replace(/'/g, '&apos;')}'`)
    .join(' ');
  return parse(
    `<message from='${attrs.room}@conference.xmpp.example.com/x' type='chat'>` +
      `<stanza-id xmlns='urn:xmpp:sid:0' id='${Date.now()}000'/>` +
      `<data type='call-token' ${rendered}/></message>`
  );
};

const call = () => store.getState().call;

const configure = (videoCalls: Record<string, unknown> = {}) =>
  store.dispatch(
    setConfig({ videoCalls: { enabled: true, livekitUrl: 'wss://lk', ...videoCalls } } as any)
  );

describe('call-token handling: livekit, p2p and group', () => {
  beforeEach(() => {
    (globalThis as any).RTCPeerConnection = class {};
    store.dispatch(resetCall());
    store.dispatch(setUser({ xmppUsername: 'app_a' } as any));
    configure();
    store.dispatch(
      addRoom({
        roomData: { jid: DM_JID, name: 'Bob B', type: 'private', usersCnt: 2 } as IRoom,
      })
    );
    store.dispatch(
      addRoom({
        roomData: { jid: GROUP_JID, name: 'Design team', type: 'group', usersCnt: 6 } as IRoom,
      })
    );
    reportCallDeclined.mockClear();
    reportCallEnded.mockClear();
    p2pInbox.clear();
  });
  afterEach(() => {
    delete (globalThis as any).RTCPeerConnection;
  });

  it('a legacy token (no mode, no group) rings as a LiveKit 1:1 call, unchanged', () => {
    const handled = onCallTokenMessage(
      tokenStanza({ room: DM_ROOM, token: 'jwt-token', callId: 'c-legacy' })
    );
    expect(handled).toBe(true);
    expect(call()).toMatchObject({
      phase: 'ringing-incoming',
      direction: 'incoming',
      mode: 'livekit',
      isGroup: false,
      token: 'jwt-token',
      callId: 'c-legacy',
      peerXmppUsername: 'app_b',
      roomName: 'Bob B',
      iceServers: null,
    });
  });

  it('a livekit token carries the stanza livekitUrl into the incoming call; absent means unset', () => {
    onCallTokenMessage(
      tokenStanza({ room: DM_ROOM, token: 'jwt', callId: 'c-url', livekitUrl: 'wss://lk.example.com' })
    );
    expect(call()).toMatchObject({ mode: 'livekit', livekitUrl: 'wss://lk.example.com' });

    store.dispatch(resetCall());
    onCallTokenMessage(tokenStanza({ room: DM_ROOM, token: 'jwt', callId: 'c-nourl' }));
    expect(call().livekitUrl).toBeNull();

    store.dispatch(resetCall());
    onCallTokenMessage(
      tokenStanza({ room: DM_ROOM, token: 'jwt', callId: 'c-bad', livekitUrl: 'javascript:alert(1)' })
    );
    expect(call()).toMatchObject({ phase: 'ringing-incoming', livekitUrl: null });
  });

  it('a group livekit token carries the URL too', () => {
    onCallTokenMessage(
      tokenStanza({ room: GROUP_ROOM, token: 'jwt', callId: 'c-g', group: 'true', livekitUrl: 'wss://lk.example.com' })
    );
    expect(call()).toMatchObject({ isGroup: true, livekitUrl: 'wss://lk.example.com' });
  });

  it("the caller's own livekit token URL wins over the create response's", () => {
    store.dispatch(
      startOutgoingCall({ roomJid: DM_JID, roomBareName: DM_ROOM, kind: 'video', peerXmppUsername: 'app_b' })
    );
    store.dispatch(
      setOutgoingCallRoute({
        startedAt: call().startedAt,
        callId: 'c-out',
        mode: 'livekit',
        livekitUrl: 'wss://from-response.example.com',
      })
    );
    onCallTokenMessage(
      tokenStanza({ room: DM_ROOM, token: 'mine', callId: 'c-out', livekitUrl: 'wss://from-stanza.example.com' })
    );
    expect(call()).toMatchObject({
      direction: 'outgoing',
      phase: 'connecting',
      token: 'mine',
      livekitUrl: 'wss://from-stanza.example.com',
    });

    // A token without the attribute leaves the known URL alone.
    onCallTokenMessage(tokenStanza({ room: DM_ROOM, token: 'mine2', callId: 'c-out' }));
    expect(call().livekitUrl).toBe('wss://from-stanza.example.com');
  });

  it('a p2p token rings with an empty token, the ICE servers and the callId', () => {
    onCallTokenMessage(
      tokenStanza({
        room: DM_ROOM,
        token: '',
        callId: 'c-p2p',
        mode: 'p2p',
        kind: 'audio',
        group: 'false',
        ice: JSON.stringify(ICE),
      })
    );
    expect(call()).toMatchObject({
      phase: 'ringing-incoming',
      mode: 'p2p',
      isGroup: false,
      token: '',
      kind: 'audio',
      callId: 'c-p2p',
      peerXmppUsername: 'app_b',
      iceServers: ICE,
    });
  });

  it('a p2p token without a callId cannot be correlated and is ignored', () => {
    onCallTokenMessage(tokenStanza({ room: DM_ROOM, token: '', mode: 'p2p' }));
    expect(call().phase).toBe('idle');
  });

  it('a p2p token is declined (not left ringing) when the browser has no WebRTC', () => {
    delete (globalThis as any).RTCPeerConnection;
    onCallTokenMessage(
      tokenStanza({ room: DM_ROOM, token: '', callId: 'c-nortc', mode: 'p2p' })
    );
    expect(call().phase).toBe('idle');
    expect(reportCallDeclined).toHaveBeenCalledWith('c-nortc');
  });

  it('a group token rings for the ROOM, with no peer and the group flag', () => {
    onCallTokenMessage(
      tokenStanza({
        room: GROUP_ROOM,
        token: 'jwt-token',
        callId: 'c-group',
        mode: 'livekit',
        kind: 'video',
        group: 'true',
      })
    );
    expect(call()).toMatchObject({
      phase: 'ringing-incoming',
      mode: 'livekit',
      isGroup: true,
      roomName: 'Design team',
      roomBareName: GROUP_ROOM,
      peerXmppUsername: null,
      callId: 'c-group',
    });
  });

  it('group tokens follow the host: allowedRoomTypes without group drops them', () => {
    configure({ allowedRoomTypes: ['private'] });
    onCallTokenMessage(
      tokenStanza({ room: GROUP_ROOM, token: 't', callId: 'c', group: 'true' })
    );
    expect(call().phase).toBe('idle');
  });

  it('group tokens follow the master switch', () => {
    configure({ enabled: false });
    onCallTokenMessage(
      tokenStanza({ room: GROUP_ROOM, token: 't', callId: 'c', group: 'true' })
    );
    expect(call().phase).toBe('idle');
  });

  it('a group flag on a room we know is private is contradictory and ignored', () => {
    onCallTokenMessage(
      tokenStanza({ room: DM_ROOM, token: 't', callId: 'c', group: 'true' })
    );
    expect(call().phase).toBe('idle');
  });

  it('an old-server token for a group room (no group attr) is still not rung', () => {
    onCallTokenMessage(tokenStanza({ room: GROUP_ROOM, token: 't', callId: 'c' }));
    expect(call().phase).toBe('idle');
  });

  describe('one call at a time', () => {
    const activeP2p = () =>
      store.dispatch(
        setIncomingCallToken({
          roomJid: DM_JID,
          roomBareName: DM_ROOM,
          token: '',
          callId: 'c-active',
          mode: 'p2p',
          peerXmppUsername: 'app_b',
        })
      );

    it('a re-delivery of the active call is ignored', () => {
      activeP2p();
      const before = call();
      onCallTokenMessage(
        tokenStanza({ room: DM_ROOM, token: '', callId: 'c-active', mode: 'p2p' })
      );
      expect(call()).toEqual(before);
      expect(reportCallDeclined).not.toHaveBeenCalled();
    });

    it('a second p2p call while one is active is declined and does not replace it', () => {
      activeP2p();
      onCallTokenMessage(
        tokenStanza({ room: GROUP_ROOM, token: '', callId: 'c-other', mode: 'p2p' })
      );
      expect(call().callId).toBe('c-active');
      // Not a private room we know: ignored before the busy check; use the DM room.
      onCallTokenMessage(
        tokenStanza({ room: DM_ROOM, token: '', callId: 'c-other', mode: 'p2p' })
      );
      expect(call().callId).toBe('c-active');
      expect(reportCallDeclined).toHaveBeenCalledWith('c-other');
    });

    it('both users dialling at once: the smaller callId survives on both ends', () => {
      store.dispatch(
        startOutgoingCall({
          roomJid: DM_JID,
          roomBareName: DM_ROOM,
          kind: 'video',
          peerXmppUsername: 'app_b',
        })
      );
      const startedAt = call().startedAt;
      store.dispatch(
        setOutgoingCallRoute({ startedAt, callId: 'm-2', mode: 'p2p', iceServers: [] })
      );

      // Their call has the bigger id: we keep ours and ignore the token.
      onCallTokenMessage(
        tokenStanza({ room: DM_ROOM, token: '', callId: 'z-9', mode: 'p2p' })
      );
      expect(call()).toMatchObject({ direction: 'outgoing', callId: 'm-2' });
      expect(reportCallEnded).not.toHaveBeenCalled();

      // Their call has the smaller id: we drop ours and ring for theirs.
      onCallTokenMessage(
        tokenStanza({ room: DM_ROOM, token: '', callId: 'a-1', mode: 'p2p' })
      );
      expect(call()).toMatchObject({
        direction: 'incoming',
        phase: 'ringing-incoming',
        callId: 'a-1',
      });
      expect(reportCallEnded).toHaveBeenCalledWith('m-2');
    });

    it('a livekit token during a livekit call still overwrites it (legacy behaviour)', () => {
      onCallTokenMessage(
        tokenStanza({ room: DM_ROOM, token: 'one', callId: 'l-1' })
      );
      onCallTokenMessage(
        tokenStanza({ room: DM_ROOM, token: 'two', callId: 'l-2' })
      );
      expect(call()).toMatchObject({ token: 'two', callId: 'l-2' });
    });
  });
});

describe('call-state signalling around groups and p2p', () => {
  const stateStanza = (type: string, attrs: string) =>
    parse(
      `<message from='${GROUP_ROOM}@conference.xmpp.example.com/x'><data type='${type}' ${attrs}/></message>`
    );

  beforeEach(() => {
    store.dispatch(resetCall());
    configure();
    store.dispatch(
      setIncomingCallToken({
        roomJid: GROUP_JID,
        roomBareName: GROUP_ROOM,
        token: 't',
        callId: 'c-group',
        isGroup: true,
      })
    );
  });

  it('a group member declining does NOT end the call (call-state-declined)', () => {
    onCallTokenMessage(
      stateStanza(
        'call-state-declined',
        `callId='c-group' room='${GROUP_ROOM}' group='true' by='someone'`
      )
    );
    expect(call().phase).toBe('ringing-incoming');
  });

  it('...nor a client-style call-state declined flagged as group', () => {
    onCallTokenMessage(
      stateStanza(
        'call-state',
        `state='declined' callId='c-group' room='${GROUP_ROOM}' group='true'`
      )
    );
    expect(call().phase).toBe('ringing-incoming');
  });

  it('a 1:1 call-state-declined ends the call', () => {
    store.dispatch(resetCall());
    store.dispatch(
      setIncomingCallToken({
        roomJid: DM_JID,
        roomBareName: DM_ROOM,
        token: 't',
        callId: 'c-dm',
      })
    );
    onCallTokenMessage(
      parse(
        `<message from='${DM_ROOM}@conference.xmpp.example.com/x'><data type='call-state-declined' callId='c-dm' room='${DM_ROOM}' mode='p2p'/></message>`
      )
    );
    expect(call().phase).toBe('idle');
  });

  it('a log of a DIFFERENT call in the same room does not end the current one', () => {
    onCallTokenMessage(
      stateStanza(
        'call-state',
        `callId='c-previous' durationMs='5000' callerXmppUsername='x'`
      )
    );
    expect(call().phase).toBe('ringing-incoming');
    // ...while the right callId still does.
    onCallTokenMessage(
      stateStanza(
        'call-state',
        `callId='c-group' durationMs='5000' callerXmppUsername='x'`
      )
    );
    expect(call().phase).toBe('idle');
  });
});

describe('call-p2p stanzas', () => {
  it('are swallowed (never reach the chat pipeline) and routed to the inbox', () => {
    configure();
    store.dispatch(setUser({ xmppUsername: 'app_a' } as any));
    const seen = vi.fn();
    p2pInbox.attach('c1', seen);
    const handled = onCallTokenMessage(
      parse(
        `<message from='app_b@xmpp.example.com/r' type='chat'><body>system</body>` +
          `<data type='call-p2p' callId='c1' signal='candidate' payload='{&quot;candidate&quot;:&quot;x&quot;}'/></message>`
      )
    );
    expect(handled).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('are dropped but still swallowed when calls are disabled', () => {
    configure({ enabled: false });
    const seen = vi.fn();
    p2pInbox.attach('c2', seen);
    const handled = onCallTokenMessage(
      parse(
        `<message from='app_b@x/r'><data type='call-p2p' callId='c2' signal='end' payload='{}'/></message>`
      )
    );
    expect(handled).toBe(true);
    expect(seen).not.toHaveBeenCalled();
  });
});
