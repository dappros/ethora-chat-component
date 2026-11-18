import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'ltx';

const getRoomsMock = vi.fn();
const invalidateRoomsCacheMock = vi.fn();
vi.mock('./api-requests/rooms.api', () => ({
  getRooms: (...args: unknown[]) => getRoomsMock(...args),
  invalidateRoomsCache: (...args: unknown[]) => invalidateRoomsCacheMock(...args),
}));

import { onRoomJoinRefused, resetRoomJoinRefusedState } from './roomJoinRefused';
import { store } from '../roomStore';
import { addRoom, setCurrentRoom, setLogoutState } from '../roomStore/roomsSlice';
import { setUser } from '../roomStore/chatSettingsSlice';

const CONFERENCE = 'conference.xmpp.example.com';
const ROOM = `app_room1@${CONFERENCE}`;
const OTHER_ROOM = `app_room2@${CONFERENCE}`;
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

const addTestRoom = (jid: string) =>
  store.dispatch(
    addRoom({
      roomData: {
        jid,
        name: jid.split('@')[0],
        title: jid.split('@')[0],
        type: 'group',
        members: [],
        usersCnt: 1,
        messages: [],
      } as any,
    } as any)
  );

const refused = (condition = 'forbidden', from = `${ROOM}/me`) =>
  parse(
    `<presence xmlns='jabber:client' from='${from}' type='error'>` +
      `<x xmlns='http://jabber.org/protocol/muc'/>` +
      `<error type='auth'><${condition} xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/>` +
      `<text xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'>You have been banned from this room</text>` +
      `</error></presence>`
  );

const apiRoom = (name: string) => ({ name, title: name, type: 'group', members: [] });

describe('room join refused with <forbidden/>', () => {
  beforeEach(() => {
    resetRoomJoinRefusedState();
    store.dispatch(setLogoutState());
    getRoomsMock.mockReset().mockResolvedValue({ items: [] });
    invalidateRoomsCacheMock.mockReset();
    store.dispatch(setUser({ xmppUsername: 'me', token: 'tkn' } as any));
    addTestRoom(ROOM);
    addTestRoom(OTHER_ROOM);
    store.dispatch(setCurrentRoom({ roomJID: ROOM }));
  });

  it('drops the room when the server no longer lists it, and moves off it', async () => {
    getRoomsMock.mockResolvedValue({ items: [apiRoom('app_room2')] });
    onRoomJoinRefused(refused());
    await flush();

    expect(invalidateRoomsCacheMock).toHaveBeenCalledTimes(1);
    expect(store.getState().rooms.rooms[ROOM]).toBeUndefined();
    expect(store.getState().rooms.rooms[OTHER_ROOM]).toBeDefined();
    expect(store.getState().rooms.activeRoomJID).toBe(OTHER_ROOM);
  });

  it('keeps the room when the server still lists it (affiliation not written yet)', async () => {
    getRoomsMock.mockResolvedValue({ items: [apiRoom('app_room1'), apiRoom('app_room2')] });
    onRoomJoinRefused(refused());
    await flush();
    expect(store.getState().rooms.rooms[ROOM]).toBeDefined();
  });

  it('keeps the room when the room list cannot be loaded', async () => {
    getRoomsMock.mockResolvedValue({ items: [], failed: true });
    onRoomJoinRefused(refused());
    await flush();
    expect(store.getState().rooms.rooms[ROOM]).toBeDefined();
  });

  it('ignores other join errors', async () => {
    onRoomJoinRefused(refused('item-not-found'));
    onRoomJoinRefused(refused('not-allowed'));
    await flush();
    expect(getRoomsMock).not.toHaveBeenCalled();
    expect(store.getState().rooms.rooms[ROOM]).toBeDefined();
  });

  it('ignores rooms not in the list and non-room senders', async () => {
    onRoomJoinRefused(refused('forbidden', `app_other@${CONFERENCE}/me`));
    onRoomJoinRefused(refused('forbidden', 'someone@xmpp.example.com/res'));
    await flush();
    expect(getRoomsMock).not.toHaveBeenCalled();
  });

  it('checks a room at most once per window, however many refusals arrive', async () => {
    getRoomsMock.mockResolvedValue({ items: [apiRoom('app_room1')] });
    onRoomJoinRefused(refused());
    onRoomJoinRefused(refused());
    await flush();
    onRoomJoinRefused(refused());
    await flush();
    expect(getRoomsMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a signed-in user', async () => {
    store.dispatch(setUser({ xmppUsername: 'me', token: '' } as any));
    onRoomJoinRefused(refused());
    await flush();
    expect(getRoomsMock).not.toHaveBeenCalled();
  });
});
