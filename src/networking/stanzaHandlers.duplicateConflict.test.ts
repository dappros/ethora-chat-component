import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'ltx';

vi.mock('./apiClient', () => ({
  default: { get: vi.fn() },
  setBaseURL: vi.fn(),
}));

import { handleStanza } from './xmpp/handleStanzas.xmpp';
import { store } from '../roomStore';
import {
  addRoom,
  addRoomMessage,
  setLogoutState,
  setMessageSendFailed,
} from '../roomStore/roomsSlice';

/**
 * Server dedup answer: when ejabberd's mod_message_dedup drops a resent
 * copy (reconnect replay or retry) it answers the sender with
 * `<message type="error" id="same id"><error><conflict/></error></message>`.
 * The copy it kept is the delivered one, so the bubble must flip to
 * delivered and leave "Failed". Otherwise a message whose first echo was
 * lost with the old session stays "Failed" and every retry is dropped.
 */

const ROOM = 'general@conference.xmpp.example.com';
const ID = 'send-text-message-1';

const errorStanza = (id = ID, condition = 'conflict') =>
  parse(
    `<message xmlns="jabber:client" type="error" id="${id}" from="${ROOM}" to="u@xmpp.example.com/res">` +
      `<error type="cancel"><${condition} xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/>` +
      '<text xmlns="urn:ietf:params:xml:ns:xmpp-stanzas">Duplicate message: already received</text>' +
      '</error></message>'
  );

const client = {
  acknowledgeSentMessage: vi.fn(),
  recoverRoomPresenceOnly: vi.fn(async () => undefined),
} as any;

const message = () =>
  store
    .getState()
    .rooms.rooms[ROOM]?.messages?.find((m) => m.id === ID) as any;

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  store.dispatch(setLogoutState());
  store.dispatch(
    addRoom({
      roomData: {
        jid: ROOM,
        id: ROOM,
        name: 'general',
        title: 'general',
        usersCnt: 1,
        messages: [],
        isLoading: false,
        roomBg: null,
      } as any,
    })
  );
  store.dispatch(
    addRoomMessage({
      roomJID: ROOM,
      message: {
        id: ID,
        xmppId: ID,
        body: 'hi',
        roomJid: ROOM,
        date: new Date().toISOString(),
        pending: true,
        user: { id: 'u', name: 'U' },
      } as any,
    })
  );
});

describe('conflict error from the server dedup', () => {
  it('marks a pending message delivered', async () => {
    expect(message().pending).toBe(true);
    handleStanza(errorStanza(), client);
    await flush();
    expect(message().pending).toBe(false);
    expect(client.acknowledgeSentMessage).toHaveBeenCalledWith(ROOM, ID);
  });

  it('clears the "Failed" state', async () => {
    store.dispatch(setMessageSendFailed({ roomJID: ROOM, messageId: ID }));
    expect(message().failed).toBe(true);
    handleStanza(errorStanza(), client);
    await flush();
    expect(message().failed).toBe(false);
    expect(message().pending).toBe(false);
  });

  it('ignores other message errors', async () => {
    handleStanza(errorStanza(ID, 'not-acceptable'), client);
    await flush();
    expect(message().pending).toBe(true);
    expect(client.acknowledgeSentMessage).not.toHaveBeenCalled();
  });

  it('ignores a conflict for an id it does not know', async () => {
    handleStanza(errorStanza('someone-else'), client);
    await flush();
    expect(message().pending).toBe(true);
    expect(client.acknowledgeSentMessage).not.toHaveBeenCalled();
  });

  it('does not add anything to the room', async () => {
    const before = store.getState().rooms.rooms[ROOM].messages.length;
    handleStanza(errorStanza(), client);
    await flush();
    expect(store.getState().rooms.rooms[ROOM].messages.length).toBe(before);
  });
});
