import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse, type Element } from 'ltx';

vi.mock('./api-requests/rooms.api', () => ({
  getRooms: vi.fn(),
  invalidateRoomsCache: vi.fn(),
  getRoomByName: vi.fn(),
}));

import { handleStanza } from './xmpp/handleStanzas.xmpp';
import { store } from '../roomStore';
import {
  addRoom,
  setLogoutState,
  setRoomMessages,
} from '../roomStore/roomsSlice';
import { setUser } from '../roomStore/chatSettingsSlice';
import { resetTrustSafety } from '../roomStore/trustSafetySlice';
import { resetCall, startOutgoingCall } from '../roomStore/callSlice';
import type { IMessage, User } from '../types/types';

const DM = 'dm1@conference.xmpp.example.com';
const ME = 'app1_me';
const PEER = 'app1_bob';

const fakeClient = {
  username: ME,
  queueDeliveryReceipt: vi.fn(),
  acknowledgeSentMessage: vi.fn(),
} as never;

const bounce = (from: string, id = 'out-1', payload = '') =>
  parse(
    `<message type="error" from="${from}" to="${ME}@xmpp.example.com/web" id="${id}">${payload}<error type="cancel"><not-acceptable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/><text xmlns="urn:ietf:params:xml:ns:xmpp-stanzas">Recipient account is suspended</text><suspended xmlns="urn:ethora:moderation"/></error></message>`
  ) as Element;

const messages = () =>
  (store.getState().rooms.rooms[DM]?.messages || []) as IMessage[];

describe('bounce from a suspended recipient', () => {
  beforeEach(() => {
    store.dispatch(setLogoutState());
    store.dispatch(resetTrustSafety());
    store.dispatch(resetCall());
    store.dispatch(setUser({ xmppUsername: ME } as User));
    store.dispatch(
      addRoom({
        roomData: {
          jid: DM,
          name: 'dm1',
          title: 'Bob',
          type: 'private',
          messages: [],
          members: [
            { _id: '1', firstName: '', lastName: '', xmppUsername: ME },
            { _id: '2', firstName: 'Bob', lastName: '', xmppUsername: PEER },
          ],
        } as never,
      })
    );
    store.dispatch(
      setRoomMessages({
        roomJID: DM,
        messages: [
          {
            id: 'out-1',
            body: 'are you there?',
            date: new Date().toISOString(),
            roomJid: DM,
            pending: true,
            user: { id: ME, name: 'Me' },
          } as IMessage,
        ],
      })
    );
  });

  it('marks the recipient suspended and the message failed for good', () => {
    handleStanza(bounce(`${PEER}@xmpp.example.com`), fakeClient);
    expect(store.getState().trustSafety.peers[PEER]?.suspended).toBe(true);
    expect(messages()[0]).toMatchObject({
      failed: true,
      pending: false,
      failedReason: 'peer-suspended',
    });
  });

  it('a bounce naming the 1:1 room marks its other member', () => {
    handleStanza(bounce(DM), fakeClient);
    expect(store.getState().trustSafety.peers[PEER]?.suspended).toBe(true);
    expect(store.getState().trustSafety.peers[ME]).toBeUndefined();
    expect(messages()[0].failedReason).toBe('peer-suspended');
  });

  it('a bounced call signal ends the call being placed to that account', () => {
    store.dispatch(
      startOutgoingCall({
        roomJid: DM,
        roomName: 'Bob',
        roomBareName: 'dm1',
        kind: 'video',
        peerXmppUsername: PEER,
      })
    );
    handleStanza(
      bounce(
        `${PEER}@xmpp.example.com`,
        'sig-1',
        '<body>call-invite</body><data xmlns="wss://xmpp.example.com" type="call-invite" kind="video"/>'
      ),
      fakeClient
    );
    expect(store.getState().call.phase).toBe('error');
    expect(store.getState().call.error).toBe(
      "This account is suspended. You can't message or call it."
    );
    // The original message was not the one bounced.
    expect(messages()[0].failed).toBeFalsy();
  });

  it('leaves other error stanzas to the existing handler', () => {
    handleStanza(
      parse(
        `<message type="error" from="${PEER}@xmpp.example.com" id="out-1"><error type="cancel"><not-acceptable xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></message>`
      ) as Element,
      fakeClient
    );
    expect(store.getState().trustSafety.peers[PEER]).toBeUndefined();
    expect(messages()[0].failedReason).toBeUndefined();
  });
});
