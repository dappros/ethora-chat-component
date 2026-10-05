import { beforeEach, describe, expect, it } from 'vitest';
import { store, resetSessionRoomState } from '../index';
import {
  addRoomViaApi,
  deleteAllRooms,
  setCurrentRoom,
  setChatUiVisible,
  setLastViewedTimestamp,
  setRoomMessages,
  addRoomMessage,
} from '../roomsSlice';
import { createRoomFromApi } from '../../helpers/createRoomFromApi';
import { ApiRoom, IRoom } from '../../types/types';

const SERVICE = 'conference.example.com';
const JID = `app_room1@${SERVICE}`;

const apiRoom = (extra: Partial<ApiRoom> = {}): ApiRoom => ({
  name: 'app_room1',
  type: 'group',
  title: 'Room 1',
  ...extra,
});

const seed = async (extra: Partial<ApiRoom> = {}) =>
  store.dispatch(
    addRoomViaApi({
      room: createRoomFromApi(apiRoom(extra), SERVICE) as IRoom,
      xmpp: {} as never,
    })
  );

const msg = (id: string, ts: number, from = 'peer-1') =>
  ({
    id,
    body: `body ${id}`,
    date: new Date(ts).toISOString(),
    roomJid: JID,
    user: { id: from, name: from },
  }) as never;

const room = () => store.getState().rooms.rooms[JID];

describe('unread from /chats/my `unreadCount`', () => {
  beforeEach(() => {
    store.dispatch(deleteAllRooms());
    store.dispatch(setCurrentRoom({ roomJID: null }));
    store.dispatch(setChatUiVisible(true));
  });

  it('shows the API count straight away, with no history loaded', () => {
    seed({ unreadCount: 5 });
    expect(room().messages).toHaveLength(0);
    expect(room().unreadMessages).toBe(5);
  });

  it('changes nothing for a backend that sends no unreadCount', () => {
    seed();
    expect(room().apiUnreadCount).toBeUndefined();
    expect(room().unreadMessages).toBe(0);
  });

  it('does not double count when MAM later loads the messages the API already counted', () => {
    seed({ unreadCount: 3 });
    const old = Date.now() - 60_000;
    store.dispatch(
      setRoomMessages({
        roomJID: JID,
        messages: [msg('a', old), msg('b', old + 1000), msg('c', old + 2000)],
      })
    );
    expect(room().messages.length).toBe(3);
    expect(room().unreadMessages).toBe(3);
  });

  it('adds messages that arrive after the seed on top of the API number', () => {
    seed({ unreadCount: 3 });
    store.dispatch(
      addRoomMessage({ roomJID: JID, message: msg('live', Date.now() + 5) })
    );
    expect(room().unreadMessages).toBe(4);
  });

  it('is not reset to 0 by an unrelated room update', () => {
    seed({ unreadCount: 2 });
    store.dispatch(setLastViewedTimestamp({ chatJID: JID, timestamp: 0 }));
    expect(room().unreadMessages).toBe(2);
  });

  it('is ignored once the user has read past the API last message', () => {
    const lastAt = Date.now() - 10_000;
    seed({
      unreadCount: 4,
      lastMessage: { body: 'x', createdAt: new Date(lastAt).toISOString() },
    });
    expect(room().unreadMessages).toBe(4);
    // Read on another device (private store marker) after that message.
    store.dispatch(
      setLastViewedTimestamp({ chatJID: JID, timestamp: lastAt + 1000 })
    );
    expect(room().unreadMessages).toBe(0);
  });

  it('opening the room clears it for good (it does not come back on leave)', () => {
    seed({ unreadCount: 6 });
    store.dispatch(setCurrentRoom({ roomJID: JID }));
    expect(room().unreadMessages).toBe(0);
    expect(room().apiUnreadCount).toBeUndefined();
    store.dispatch(setCurrentRoom({ roomJID: null }));
    store.dispatch(
      setRoomMessages({ roomJID: JID, messages: [msg('z', Date.now() - 1000)] })
    );
    expect(room().unreadMessages).toBe(0);
  });

  it('a /chats/my refresh brings the fresh count; one without the field keeps the last', () => {
    seed({ unreadCount: 2 });
    seed({ unreadCount: 7 });
    expect(room().unreadMessages).toBe(7);
    seed();
    expect(room().apiUnreadCount).toBe(7);
    expect(room().unreadMessages).toBe(7);
  });

  it('a refresh while the room is open does not re-seed an unread badge', () => {
    seed({ unreadCount: 1 });
    store.dispatch(setCurrentRoom({ roomJID: JID }));
    seed({ unreadCount: 9 });
    expect(room().unreadMessages).toBe(0);
  });
});

describe('resetSessionRoomState (rehydrate)', () => {
  it("demotes a persisted 'done'/'loading' so the room is refetched once per session", () => {
    const out = resetSessionRoomState({
      a: { historyPreloadState: 'done', messages: [{ id: '1' }] },
      b: { historyPreloadState: 'done', messages: [] },
      c: { historyPreloadState: 'loading', messages: [{ id: '1' }] },
      d: { historyPreloadState: 'partial', messages: [] },
      e: { historyPreloadState: 'error', messages: [] },
      f: { historyPreloadState: 'idle', apiUnreadCount: 4, apiUnreadSeededAt: 1 },
    } as never);
    expect(out.a.historyPreloadState).toBe('partial');
    expect(out.b.historyPreloadState).toBe('idle');
    expect(out.c.historyPreloadState).toBe('partial');
    expect(out.d.historyPreloadState).toBe('partial');
    expect(out.e.historyPreloadState).toBe('idle');
    expect(out.f.apiUnreadCount).toBeUndefined();
  });
});
