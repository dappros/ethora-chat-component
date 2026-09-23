import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parse } from 'ltx';

// onChatInvite's own corrective re-fetch goes through getRooms()/
// invalidateRoomsCache() (rooms.api.ts) - stub those instead of hitting the
// network, same idea as the other repro tests that drive the real stanza
// router (see callLogLiveFlow.repro.test.ts).
const getRoomsMock = vi.fn();
const invalidateRoomsCacheMock = vi.fn();
const getRoomByNameMock = vi.fn();
vi.mock('./api-requests/rooms.api', () => ({
  getRooms: (...args: unknown[]) => getRoomsMock(...args),
  invalidateRoomsCache: (...args: unknown[]) => invalidateRoomsCacheMock(...args),
  getRoomByName: (...args: unknown[]) => getRoomByNameMock(...args),
}));

import { handleStanza } from './xmpp/handleStanzas.xmpp';
import { store } from '../roomStore';
import { setLogoutState } from '../roomStore/roomsSlice';
import { setUser } from '../roomStore/chatSettingsSlice';

const CONFERENCE = 'conference.xmpp.chat-qa.ethora.com';
const ROOM_JID = `646cc8dc96d4a4dc8f7b2f2d_6ab3a116d1f5c231da4c84fd-646cc8dc96d4a4dc8f7b2f2d_me@${CONFERENCE}`;
const MY_JID = '646cc8dc96d4a4dc8f7b2f2d_me@xmpp.chat-qa.ethora.com';

// The classic XEP-0045 mediated-invite shape onChatInvite looks for: a
// <message> (no <body>, so onRealtimeMessage ignores it) carrying an
// <x xmlns='...muc#user'><invite/></x>. This is what notifies X in real
// time that a brand-new private room now exists.
const inviteStanza = (from: string) =>
  parse(
    `<message xmlns='jabber:client' from='${from}' to='${MY_JID}'>` +
      `<x xmlns='http://jabber.org/protocol/muc#user'>` +
      `<invite from='646cc8dc96d4a4dc8f7b2f2d_6ab3a116d1f5c231da4c84fd@xmpp.chat-qa.ethora.com'/>` +
      `</x>` +
      `</message>`
  );

const fakeClient = {
  username: 'me',
  conference: CONFERENCE,
  presenceInRoomStanza: vi.fn().mockResolvedValue(true),
  prioritizeRoomPresence: vi.fn().mockResolvedValue(undefined),
  getHistoryStanza: vi.fn().mockResolvedValue(undefined),
  getRoomInfoStanza: vi.fn(),
} as any;

// The handler awaits presenceInRoomStanza before calling getRooms(), so give
// the microtask queue a couple of turns to drain instead of asserting
// synchronously right after handleStanza() returns.
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

describe('onChatInvite (via the real handleStanza router) - new private room visibility', () => {
  beforeEach(() => {
    store.dispatch(setLogoutState());
    getRoomsMock.mockReset();
    invalidateRoomsCacheMock.mockReset();
    getRoomByNameMock.mockReset();
    getRoomsMock.mockResolvedValue({ items: [] });
  });

  // Reported bug: a new private room Y creates with X never appears in X's
  // list while X stays on the page. RoomList treats any room whose title AND
  // name are both blank as corrupted persisted state and deletes it
  // (isValidRoomRecord in RoomList.tsx) - the old placeholder here handed it
  // exactly that.
  it('adds the room with a non-empty placeholder label instead of a blank one', async () => {
    handleStanza(inviteStanza(ROOM_JID), fakeClient);
    await flush();

    const room = store.getState().rooms.rooms[ROOM_JID];
    expect(room).toBeTruthy();
    expect(room.title).not.toBe('');
    expect(room.name).not.toBe('');
  });

  // getRooms() caches /v1/chats/my for 60s. Without invalidating first, the
  // corrective re-fetch below can silently serve the pre-invite list - the
  // new room never gets its real title, and never gets added back if
  // RoomList's cleanup effect already pruned the blank placeholder.
  it('invalidates the rooms cache before refetching to get the new room and its title', async () => {
    handleStanza(inviteStanza(ROOM_JID), fakeClient);
    await flush();

    expect(invalidateRoomsCacheMock).toHaveBeenCalled();
    expect(getRoomsMock).toHaveBeenCalled();
    const invalidateOrder = invalidateRoomsCacheMock.mock.invocationCallOrder[0];
    const getRoomsOrder = getRoomsMock.mock.invocationCallOrder[0];
    expect(invalidateOrder).toBeLessThan(getRoomsOrder);
  });

  it('the corrective refetch replaces the placeholder with the real title once it resolves', async () => {
    getRoomsMock.mockResolvedValue({
      items: [
        {
          name: ROOM_JID.split('@')[0],
          title: '',
          type: 'private',
          members: [
            { xmppUsername: 'me', firstName: 'Me', lastName: 'Myself' },
            {
              xmppUsername: '646cc8dc96d4a4dc8f7b2f2d_6ab3a116d1f5c231da4c84fd',
              firstName: 'New',
              lastName: 'User',
            },
          ],
        },
      ],
    });
    store.dispatch(setUser({ xmppUsername: 'me' } as any));

    handleStanza(inviteStanza(ROOM_JID), fakeClient);
    await flush();

    const room = store.getState().rooms.rooms[ROOM_JID];
    expect(room?.title).toBe('New User');
  });
});
