import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'ltx';

const getRoomsMock = vi.fn();
const invalidateRoomsCacheMock = vi.fn();
vi.mock('./api-requests/rooms.api', () => ({
  getRooms: (...args: unknown[]) => getRoomsMock(...args),
  invalidateRoomsCache: (...args: unknown[]) => invalidateRoomsCacheMock(...args),
  getRoomByName: vi.fn(),
}));

import { handleStanza } from './xmpp/handleStanzas.xmpp';
import { store } from '../roomStore';
import {
  addRoom,
  setCurrentRoom,
  setLogoutState,
} from '../roomStore/roomsSlice';
import { setUser } from '../roomStore/chatSettingsSlice';

const CONFERENCE = 'conference.xmpp.example.com';
const ROOM = `room1@${CONFERENCE}`;
const OTHER_ROOM = `room2@${CONFERENCE}`;
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

const kickedPresence = (extra: string, from = `${ROOM}/me`) =>
  parse(
    `<presence xmlns='jabber:client' from='${from}' type='unavailable'>` +
      `<x xmlns='http://jabber.org/protocol/muc#user'>${extra}</x></presence>`
  );

const apiRoom = (name: string) => ({
  name,
  title: name,
  type: 'group',
  members: [],
});

const setup = () => {
  store.dispatch(setLogoutState());
  getRoomsMock.mockReset().mockResolvedValue({ items: [] });
  invalidateRoomsCacheMock.mockReset();
  store.dispatch(setUser({ xmppUsername: 'me' } as any));
  addTestRoom(ROOM);
  addTestRoom(OTHER_ROOM);
  store.dispatch(setCurrentRoom({ roomJID: OTHER_ROOM }));
};

describe('MUC forced-exit presence handling', () => {
  beforeEach(setup);

  it('removes a current user who was removed by affiliation change (110 + 321)', async () => {
    handleStanza(kickedPresence(`<status code='110'/><status code='321'/>`), {} as any);
    await flush();

    expect(store.getState().rooms.rooms[ROOM]).toBeUndefined();
    expect(store.getState().rooms.activeRoomJID).toBe(OTHER_ROOM);
    expect(getRoomsMock).toHaveBeenCalledTimes(1);
  });

  it('removes a destroyed room with status 110 and destroy but no 321', async () => {
    handleStanza(kickedPresence(`<status code='110'/><destroy/>`), {} as any);
    await flush();

    expect(store.getState().rooms.rooms[ROOM]).toBeUndefined();
    expect(getRoomsMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the room after an ordinary own unavailable presence', async () => {
    handleStanza(kickedPresence(`<status code='110'/>`), {} as any);
    await flush();

    expect(store.getState().rooms.rooms[ROOM]).toBeDefined();
    expect(getRoomsMock).not.toHaveBeenCalled();
  });

  it('is idempotent for repeated forced-exit stanzas while the API call is pending', async () => {
    let resolveRequest!: (value: unknown) => void;
    getRoomsMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    const stanza = kickedPresence(`<status code='110'/><destroy/>`);

    handleStanza(stanza, {} as any);
    handleStanza(stanza, {} as any);
    expect(store.getState().rooms.rooms[ROOM]).toBeUndefined();
    expect(getRoomsMock).toHaveBeenCalledTimes(1);

    resolveRequest({ items: [apiRoom('room1'), apiRoom('room2')] });
    await flush();
    expect(store.getState().rooms.rooms[ROOM]).toBeUndefined();
    expect(store.getState().rooms.rooms[OTHER_ROOM]).toBeDefined();
  });

  it('does not restore a destroyed room from a stale /chats/my response', async () => {
    getRoomsMock.mockResolvedValue({ items: [apiRoom('room1')] });
    handleStanza(kickedPresence(`<status code='110'/><destroy/>`), {} as any);
    await flush();

    expect(store.getState().rooms.rooms[ROOM]).toBeUndefined();
  });

  it('keeps the local removal when the refetch fails', async () => {
    getRoomsMock.mockRejectedValue(new Error('offline'));
    handleStanza(kickedPresence(`<status code='110'/><status code='321'/>`), {} as any);
    await flush();

    expect(store.getState().rooms.rooms[ROOM]).toBeUndefined();
    expect(store.getState().rooms.activeRoomJID).toBe(OTHER_ROOM);
  });

  it('does not delete a room for missing or invalid from, or an empty MUC x', async () => {
    const missingFrom = parse(
      `<presence xmlns='jabber:client' type='unavailable'><x xmlns='http://jabber.org/protocol/muc#user'><status code='110'/><status code='321'/></x></presence>`
    );
    const invalidFrom = kickedPresence(
      `<status code='110'/><status code='321'/>`,
      'not-a-room/me'
    );
    const emptyX = parse(
      `<presence xmlns='jabber:client' from='${ROOM}/me' type='unavailable'><x/></presence>`
    );

    handleStanza(missingFrom, {} as any);
    handleStanza(invalidFrom, {} as any);
    handleStanza(emptyX, {} as any);
    await flush();

    expect(store.getState().rooms.rooms[ROOM]).toBeDefined();
    expect(getRoomsMock).not.toHaveBeenCalled();
  });

  it('does not let onPresenceInRoom apply own presence after forced deletion', async () => {
    const stanza = parse(
      `<presence xmlns='jabber:client' from='${ROOM}/me' type='unavailable'>` +
        `<x xmlns='http://jabber.org/protocol/muc#user'>` +
        `<item role='moderator'/><status code='110'/><destroy/>` +
        `</x></presence>`
    );
    handleStanza(stanza, {} as any);
    await flush();

    expect(store.getState().rooms.rooms[ROOM]).toBeUndefined();
  });

  it('selects another room when the forcibly removed room was active', async () => {
    store.dispatch(setCurrentRoom({ roomJID: ROOM }));
    handleStanza(kickedPresence(`<status code='110'/><status code='321'/>`), {} as any);
    await flush();

    expect(store.getState().rooms.activeRoomJID).toBe(OTHER_ROOM);
  });
});
