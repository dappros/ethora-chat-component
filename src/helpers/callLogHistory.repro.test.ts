import { describe, expect, it } from 'vitest';
import { parse } from 'ltx';
import { getDataFromXml } from './getDataFromXml';
import { createMessageFromXml } from './createMessageFromXml';
import {
  buildLocalCallLogMessage,
  transformCallLogMessage,
} from './callLogMessage';
import roomsReducer, {
  addRoom,
  addRoomMessage,
  setRoomMessages,
} from '../roomStore/roomsSlice';
import { IMessage, IRoom } from '../types/types';

// The user's EXACT server call-state stanza (live groupchat broadcast; the
// MAM copy carries the same inner <message>).
const STANZA = `<message xmlns='jabber:client' xml:lang='en'
  to='69c24e911e53d44d2b6c4bbc_69c2517a239cee5defaf52d6@xmpp.messenger.ethora-qa.com/135449945351333532801216274'
  from='69c24e911e53d44d2b6c4bbc_69c2517a239cee5defaf52d6-69c24e911e53d44d2b6c4bbc_69c251a0239cee5defaf5343@conference.xmpp.messenger.ethora-qa.com/69c24e911e53d44d2b6c4bbc_69c24e911e53d44d2b6c4bbc'
  type='groupchat' id='id'>
  <archived by='69c24e911e53d44d2b6c4bbc_69c2517a239cee5defaf52d6-69c24e911e53d44d2b6c4bbc_69c251a0239cee5defaf5343@conference.xmpp.messenger.ethora-qa.com' id='1781702272543611' xmlns='urn:xmpp:mam:tmp' />
  <stanza-id by='69c24e911e53d44d2b6c4bbc_69c2517a239cee5defaf52d6-69c24e911e53d44d2b6c4bbc_69c251a0239cee5defaf5343@conference.xmpp.messenger.ethora-qa.com' id='1781702272543611' xmlns='urn:xmpp:sid:0' />
  <data xmlns='https://ethora.com/xmpp/data' fullName='Ethora' senderFirstName='Ethora' senderLastName='' senderJID='69c24e911e53d44d2b6c4bbc_69c24e911e53d44d2b6c4bbc@xmpp.messenger.ethora-qa.com/74730842354019306571041571' photo='' isSystemMessage='true' type='call-state' callId='6a329e6b45e80c7cdf067e52' durationMs='10995' callerXmppUsername='69c24e911e53d44d2b6c4bbc_69c2517a239cee5defaf52d6' />
  <body>call-state</body>
</message>`;

const ROOM_JID =
  '69c24e911e53d44d2b6c4bbc_69c2517a239cee5defaf52d6-69c24e911e53d44d2b6c4bbc_69c251a0239cee5defaf5343@conference.xmpp.messenger.ethora-qa.com';
// The receiving user (callee side; caller is ..._69c2517a...).
const SELF = '69c24e911e53d44d2b6c4bbc_69c251a0239cee5defaf5343';

const parseServerCallState = async (): Promise<IMessage> => {
  const stanza = parse(STANZA);
  const { data, id, body, ...rest } = await getDataFromXml(stanza as any);
  expect(data).toBeTruthy();
  const raw = await createMessageFromXml({ data, id, body, ...rest } as any);
  return transformCallLogMessage(raw, SELF);
};

const stateWithRoom = () => {
  let state = roomsReducer(undefined, { type: '@@INIT' });
  state = roomsReducer(
    state,
    addRoom({ roomData: { jid: ROOM_JID, name: 'test' } as IRoom })
  );
  return state;
};

describe('server call-state survives into history (user repro)', () => {
  it('parses + transforms into a call log entry', async () => {
    const message = await parseServerCallState();
    expect(message.body).toBe('Incoming call · 11 sec');
    expect((message as any).callLog?.callId).toBe('6a329e6b45e80c7cdf067e52');
    expect((message as any).callLog?.durationMs).toBe(10995);
  });

  it('MAM page load (setRoomMessages) keeps the entry', async () => {
    const message = await parseServerCallState();
    let state = stateWithRoom();
    state = roomsReducer(
      state,
      setRoomMessages({ roomJID: ROOM_JID, messages: [message] })
    );
    const bodies = state.rooms[ROOM_JID].messages.map((m) => m.body);
    expect(bodies).toContain('Incoming call · 11 sec');
  });

  it('live delivery (addRoomMessage) keeps the entry', async () => {
    const message = await parseServerCallState();
    let state = stateWithRoom();
    state = roomsReducer(
      state,
      addRoomMessage({ roomJID: ROOM_JID, message })
    );
    const bodies = state.rooms[ROOM_JID].messages.map((m) => m.body);
    expect(bodies).toContain('Incoming call · 11 sec');
  });

  it('MAM load AFTER a persisted local fallback entry still shows ONE entry', async () => {
    const message = await parseServerCallState();
    let state = stateWithRoom();

    // The local fallback entry written at hangup (cb89d37) — persisted across
    // refresh by redux-persist.
    const local = buildLocalCallLogMessage({
      callId: '6a329e6b45e80c7cdf067e52',
      direction: 'incoming',
      durationMs: 11040,
      kind: 'video',
      selfXmppUsername: SELF,
    });
    state = roomsReducer(
      state,
      addRoomMessage({ roomJID: ROOM_JID, message: local })
    );

    // Refresh → MAM page merges in the server copy.
    state = roomsReducer(
      state,
      setRoomMessages({ roomJID: ROOM_JID, messages: [message] })
    );

    const entries = state.rooms[ROOM_JID].messages.filter(
      (m) => (m as any).callLog?.callId === '6a329e6b45e80c7cdf067e52'
    );
    // Must not vanish; must not duplicate.
    expect(entries.length).toBe(1);
  });

  it('live server copy arriving after the local fallback does not vanish', async () => {
    const message = await parseServerCallState();
    let state = stateWithRoom();
    const local = buildLocalCallLogMessage({
      callId: '6a329e6b45e80c7cdf067e52',
      direction: 'incoming',
      durationMs: 11040,
      kind: 'video',
      selfXmppUsername: SELF,
    });
    state = roomsReducer(
      state,
      addRoomMessage({ roomJID: ROOM_JID, message: local })
    );
    state = roomsReducer(
      state,
      addRoomMessage({ roomJID: ROOM_JID, message })
    );
    const entries = state.rooms[ROOM_JID].messages.filter(
      (m) => (m as any).callLog?.callId === '6a329e6b45e80c7cdf067e52'
    );
    expect(entries.length).toBe(1);
  });
});
