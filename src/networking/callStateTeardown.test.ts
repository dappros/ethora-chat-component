import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'ltx';
import { onCallTokenMessage } from './callTokenStanza';
import { store } from '../roomStore';
import { raiseIncomingCallFromPush } from '../helpers/incomingCallPush';
import {
  acceptIncomingCall,
  resetCall,
  setIncomingCallToken,
  setOutgoingCallToken,
  startOutgoingCall,
} from '../roomStore/callSlice';

const ROOM = 'app_alice-app_bob';
const ROOM_JID = `${ROOM}@conference.xmpp.example.com`;
const CALL_ID = 'call-1';

const ringIncoming = () =>
  store.dispatch(
    setIncomingCallToken({
      roomJid: ROOM_JID,
      roomBareName: ROOM,
      token: 'jwt',
      kind: 'audio',
      callId: CALL_ID,
      peerXmppUsername: 'app_alice',
    })
  );

const dialOutgoing = () => {
  store.dispatch(
    startOutgoingCall({
      roomJid: ROOM_JID,
      roomBareName: ROOM,
      kind: 'video',
      peerXmppUsername: 'app_alice',
    })
  );
  store.dispatch(
    setOutgoingCallToken({ roomJid: ROOM_JID, token: 'jwt', callId: CALL_ID })
  );
};

// What the peer's sendCallStateSignal puts on the wire: a direct chat
// message with the state on the <data> element.
const peerSignal = (state: string) =>
  parse(
    `<message xmlns='jabber:client' type='chat' from='app_alice@xmpp.example.com/web' to='app_bob@xmpp.example.com'>` +
      `<data type='call-state' state='${state}' callId='${CALL_ID}' room='${ROOM}'/>` +
      `</message>`
  );

describe('call teardown from call-state stanzas', () => {
  beforeEach(() => {
    store.dispatch(resetCall());
  });

  it('stops ringing when the caller cancels', () => {
    ringIncoming();
    expect(onCallTokenMessage(peerSignal('cancelled'))).toBe(true);
    expect(store.getState().call.phase).toBe('idle');
  });

  it('ends the dial when the callee declines', () => {
    dialOutgoing();
    onCallTokenMessage(peerSignal('declined'));
    expect(store.getState().call.phase).toBe('idle');
  });

  it('ends the call when the peer hangs up', () => {
    dialOutgoing();
    onCallTokenMessage(peerSignal('ended'));
    expect(store.getState().call.phase).toBe('idle');
  });

  it('ends the dial on the server decline (call-state-declined)', () => {
    dialOutgoing();
    onCallTokenMessage(
      parse(
        `<message xmlns='jabber:client' type='chat' from='system@xmpp.example.com' to='app_bob@xmpp.example.com'>` +
          `<body>system</body><data type='call-state-declined' room='${ROOM}' callId='${CALL_ID}'/>` +
          `</message>`
      )
    );
    expect(store.getState().call.phase).toBe('idle');
  });

  it('ends the call on the server call log broadcast into the room', () => {
    dialOutgoing();
    onCallTokenMessage(
      parse(
        `<message xmlns='jabber:client' type='groupchat' from='${ROOM_JID}/system' to='app_bob@xmpp.example.com'>` +
          `<data type='call-state' callId='${CALL_ID}' durationMs='0' callerXmppUsername='app_bob'/><body>call-state</body>` +
          `</message>`
      )
    );
    expect(store.getState().call.phase).toBe('idle');
  });

  it('leaves another call alone', () => {
    ringIncoming();
    onCallTokenMessage(
      parse(
        `<message xmlns='jabber:client' type='chat' from='app_carol@xmpp.example.com/web' to='app_bob@xmpp.example.com'>` +
          `<data type='call-state' state='cancelled' callId='other' room='app_carol-app_bob'/>` +
          `</message>`
      )
    );
    expect(store.getState().call.phase).toBe('ringing-incoming');
  });
});

// A ring raised from a push is built from the push's bare `room`, not from an
// XMPP stanza, so its identifiers must still line up with what a late
// call-state cancel carries.
describe('call teardown of a ring raised from a push', () => {
  const jwt = `h.${btoa(JSON.stringify({ exp: Date.now() / 1000 + 60 }))}.s`;
  const ctx = {
    dispatch: (action: any) => store.dispatch(action),
    getState: () => ({
      ...store.getState(),
      chatSettingStore: {
        config: { videoCalls: { enabled: true } },
        user: { token: 'user-jwt', xmppUsername: 'app_bob' },
      },
    }),
    normalizeRoomJid: (jid?: string) =>
      !jid || jid.includes('@') ? jid || '' : `${jid}@conference.xmpp.example.com`,
  };

  const pushRing = (extra: Record<string, unknown> = {}) =>
    raiseIncomingCallFromPush(ctx, {
      type: 'call',
      callId: CALL_ID,
      callToken: jwt,
      room: ROOM,
      kind: 'audio',
      callerName: 'Alice',
      callerXmppUsername: 'app_alice',
      ...extra,
    });

  beforeEach(() => {
    store.dispatch(resetCall());
  });

  it('is keyed by the normalized MUC jid and the bare room name', () => {
    expect(pushRing()).toBe('ringing');
    expect(store.getState().call).toMatchObject({
      phase: 'ringing-incoming',
      roomJid: ROOM_JID,
      roomBareName: ROOM,
      callId: CALL_ID,
      peerXmppUsername: 'app_alice',
    });
  });

  it('stops when the caller cancels', () => {
    pushRing();
    onCallTokenMessage(peerSignal('cancelled'));
    expect(store.getState().call.phase).toBe('idle');
  });

  it('stops on a cancel that names only the room', () => {
    pushRing();
    onCallTokenMessage(
      parse(
        `<message xmlns='jabber:client' type='chat' from='app_alice@xmpp.example.com/web' to='app_bob@xmpp.example.com'>` +
          `<data type='call-state' state='cancelled' room='${ROOM}'/></message>`
      )
    );
    expect(store.getState().call.phase).toBe('idle');
  });

  it('stops on a cancel that names only the callId', () => {
    pushRing();
    onCallTokenMessage(
      parse(
        `<message xmlns='jabber:client' type='chat' from='app_alice@xmpp.example.com/web' to='app_bob@xmpp.example.com'>` +
          `<data type='call-state' state='cancelled' callId='${CALL_ID}'/></message>`
      )
    );
    expect(store.getState().call.phase).toBe('idle');
  });

  it('is not stopped by another call\'s cancel', () => {
    pushRing();
    onCallTokenMessage(
      parse(
        `<message xmlns='jabber:client' type='chat' from='app_carol@xmpp.example.com/web' to='app_bob@xmpp.example.com'>` +
          `<data type='call-state' state='cancelled' callId='other' room='app_carol-app_bob'/></message>`
      )
    );
    expect(store.getState().call.phase).toBe('ringing-incoming');
  });

  it('survives the same call arriving again over XMPP after it was answered', () => {
    pushRing();
    store.dispatch(acceptIncomingCall());
    ringIncoming();
    expect(store.getState().call.phase).toBe('connecting');
  });
});
