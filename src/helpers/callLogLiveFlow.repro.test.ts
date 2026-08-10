import { describe, expect, it } from 'vitest';
import { parse } from 'ltx';
import { handleStanza } from '../networking/xmpp/handleStanzas.xmpp';
import { store } from '../roomStore';
import { addRoom, addRoomMessage } from '../roomStore/roomsSlice';
import { buildLocalCallLogMessage } from './callLogMessage';
import { IRoom } from '../types/types';

// The user's EXACT live server call-state broadcast.
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

const CALL_ID = '6a329e6b45e80c7cdf067e52';

const fakeClient = {
  username: 'test-user',
  acknowledgeSentMessage: () => {},
} as any;

const waitForAsyncHandlers = () =>
  new Promise((resolve) => setTimeout(resolve, 50));

const callEntries = () =>
  (store.getState().rooms.rooms[ROOM_JID]?.messages || []).filter(
    (m: any) => m.callLog?.callId === CALL_ID || m.type === 'call-state'
  );

describe('live call-state through the REAL stanza router (user repro)', () => {
  it('a fresh client (no local fallback) stores the entry', async () => {
    store.dispatch(
      addRoom({ roomData: { jid: ROOM_JID, name: 'test' } as IRoom })
    );

    handleStanza(parse(STANZA), fakeClient);
    await waitForAsyncHandlers();

    const entries = callEntries();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((m: any) => /call/i.test(String(m.body)))).toBe(true);
  });

  it('after a local fallback entry, the server copy still leaves ONE canonical entry', async () => {
    // Local fallback written at hangup (cb89d37), slightly larger duration
    // because the client measures until teardown completes.
    store.dispatch(
      addRoomMessage({
        roomJID: ROOM_JID,
        message: buildLocalCallLogMessage({
          callId: CALL_ID,
          direction: 'incoming',
          durationMs: 11040,
          kind: 'video',
          selfXmppUsername: '69c24e911e53d44d2b6c4bbc_69c251a0239cee5defaf5343',
        }),
      })
    );

    handleStanza(parse(STANZA), fakeClient);
    await waitForAsyncHandlers();

    const entries = callEntries();
    expect(entries.length).toBe(1);
    // Server copy is canonical: entry should carry the SERVER archive id so
    // catch-up anchors and MAM merges recognize it.
    expect(String(entries[0].id)).toBe('1781702272543611');
  });
});
