import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'ltx';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { Provider, useSelector } from 'react-redux';

const getRoomsMock = vi.fn();
const invalidateRoomsCacheMock = vi.fn();
const { roomInitializationClient, syncRoomsHookMock } = vi.hoisted(() => ({
  roomInitializationClient: {
    presenceInRoomStanza: vi.fn(async () => true),
    prioritizeRoomPresence: vi.fn(async () => true),
    setActiveRoomJid: vi.fn(),
    promoteRoomHistory: vi.fn(),
    getRoomInfoStanza: vi.fn(),
    getHistoryStanza: vi.fn(async () => []),
    getRoomsStanza: vi.fn(async () => undefined),
  },
  syncRoomsHookMock: vi.fn(async () => []),
}));
vi.mock('./api-requests/rooms.api', () => ({
  getRooms: (...args: unknown[]) => getRoomsMock(...args),
  invalidateRoomsCache: (...args: unknown[]) => invalidateRoomsCacheMock(...args),
  getRoomByName: vi.fn(),
}));
vi.mock('../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: roomInitializationClient }),
}));
vi.mock('../hooks/useGetNewArchRoom', () => ({
  default: () => syncRoomsHookMock,
}));

import { handleStanza } from './xmpp/handleStanzas.xmpp';
import { store, type RootState } from '../roomStore';
import {
  addRoom,
  setJoiningRoom,
  setMemberOnline,
  setRoomDraft,
  setCurrentRoom,
  setLogoutState,
} from '../roomStore/roomsSlice';
import { setUser } from '../roomStore/chatSettingsSlice';
import { useRoomInitialization } from '../hooks/useRoomInitialization';

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
  Object.values(roomInitializationClient).forEach((mock) => mock.mockClear());
  syncRoomsHookMock.mockReset().mockResolvedValue([]);
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

  it('removes a destroyed room from the QA stanza without status 110', async () => {
    handleStanza(kickedPresence(`<destroy/>`), {} as any);
    await flush();

    expect(store.getState().rooms.rooms[ROOM]).toBeUndefined();
    expect(getRoomsMock).toHaveBeenCalledTimes(1);
  });

  it('does not treat affiliation none without status 321 as forced removal', async () => {
    handleStanza(
      kickedPresence(`<item affiliation='none'/>`, `${ROOM}/me`),
      {} as any
    );
    await flush();

    expect(store.getState().rooms.rooms[ROOM]).toBeDefined();
    expect(getRoomsMock).not.toHaveBeenCalled();
  });

  it('removes own affiliation none when status 321 confirms the change', async () => {
    handleStanza(
      kickedPresence(
        `<item affiliation='none'/><status code='321'/>`,
        `${ROOM}/me`
      ),
      {} as any
    );
    await flush();

    expect(store.getState().rooms.rooms[ROOM]).toBeUndefined();
    expect(getRoomsMock).toHaveBeenCalledTimes(1);
  });

  it('removes our room on an explicit outcast ban even without status 321', async () => {
    handleStanza(
      kickedPresence(`<item affiliation='outcast'/>`, `${ROOM}/me`),
      {} as any
    );
    await flush();

    expect(store.getState().rooms.rooms[ROOM]).toBeUndefined();
    expect(getRoomsMock).toHaveBeenCalledTimes(1);
  });

  it('does not remove our room for another occupant affiliation presence', async () => {
    handleStanza(
      kickedPresence(`<item affiliation='none'/>`, `${ROOM}/someone-else`),
      {} as any
    );
    await flush();

    expect(store.getState().rooms.rooms[ROOM]).toBeDefined();
    expect(getRoomsMock).not.toHaveBeenCalled();
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

  it('records the current user role from MUC status 110 even when the nick differs', () => {
    const stanza = parse(
      `<presence xmlns='jabber:client' from='${ROOM}/room-nick' id='presenceInRoom-test'>` +
        `<x xmlns='http://jabber.org/protocol/muc#user'>` +
        `<item role='moderator'/><status code='110'/>` +
        `</x></presence>`
    );

    handleStanza(stanza, {} as any);

    expect(store.getState().rooms.rooms[ROOM]?.role).toBe('moderator');
  });

  it('selects another room when the forcibly removed room was active', async () => {
    store.dispatch(setCurrentRoom({ roomJID: ROOM }));
    store.dispatch(setRoomDraft({ jid: ROOM, text: 'unsent message' }));
    store.dispatch(setJoiningRoom(ROOM));
    store.dispatch(setMemberOnline({ roomJID: ROOM, xmppUsername: 'me' }));
    handleStanza(kickedPresence(`<status code='110'/><status code='321'/>`), {} as any);
    await flush();

    expect(store.getState().rooms.activeRoomJID).toBe(OTHER_ROOM);
    expect(store.getState().rooms.drafts[ROOM]).toBeUndefined();
    expect(store.getState().rooms.joiningRoomJID).toBeNull();
    expect(store.getState().rooms.presenceByRoom[ROOM]).toBeUndefined();
  });

  it('does not rejoin the removed room through useRoomInitialization', async () => {
    store.dispatch(setCurrentRoom({ roomJID: ROOM }));
    const wrapper = ({ children }: PropsWithChildren) =>
      createElement(Provider, { store }, children);
    const { unmount } = renderHook(
      () => {
        const activeRoomJID = useSelector(
          (state: RootState) => state.rooms.activeRoomJID
        );
        useRoomInitialization(activeRoomJID || '', {} as any, 0);
      },
      { wrapper }
    );

    await waitFor(() =>
      expect(roomInitializationClient.presenceInRoomStanza).toHaveBeenCalledWith(
        ROOM,
        0,
        expect.any(Number),
        true
      )
    );
    roomInitializationClient.presenceInRoomStanza.mockClear();

    await act(async () => {
      handleStanza(
        kickedPresence(`<status code='110'/><status code='321'/>`),
        {} as any
      );
      await flush();
    });

    await waitFor(() =>
      expect(store.getState().rooms.activeRoomJID).toBe(OTHER_ROOM)
    );
    await waitFor(() =>
      expect(roomInitializationClient.presenceInRoomStanza).toHaveBeenCalled()
    );
    expect(roomInitializationClient.presenceInRoomStanza).not.toHaveBeenCalledWith(
      ROOM,
      expect.anything(),
      expect.anything(),
      expect.anything()
    );

    unmount();
  });
});
