import { beforeEach, describe, expect, it } from 'vitest';
import { store } from '../index';
import {
  addRoomViaApi,
  applyRoomsPreloadBatch,
  deleteAllRooms,
  setChatUiVisible,
  setCurrentRoom,
  setLastViewedTimestamp,
  updateRoom,
} from '../roomsSlice';
import { createRoomFromApi } from '../../helpers/createRoomFromApi';
import { ApiRoom, IRoom } from '../../types/types';

const SERVICE = 'conference.example.com';
const JID = `app_room1@${SERVICE}`;

const seed = (extra: Partial<ApiRoom> = {}) =>
  store.dispatch(
    addRoomViaApi({
      room: createRoomFromApi(
        { name: 'app_room1', type: 'group', title: 'Room 1', ...extra },
        SERVICE
      ) as IRoom,
      xmpp: {} as never,
    })
  );

const msg = (id: string, ts: number) =>
  ({
    id,
    body: `body ${id}`,
    date: new Date(ts).toISOString(),
    roomJid: JID,
    user: { id: 'peer-1', name: 'peer-1' },
  }) as never;

const room = () => store.getState().rooms.rooms[JID];

/** Every distinct value the badge (room.unreadMessages) takes, in order. */
const recordBadge = () => {
  const seen: number[] = [room()?.unreadMessages ?? 0];
  const unsubscribe = store.subscribe(() => {
    const v = room()?.unreadMessages ?? 0;
    if (seen[seen.length - 1] !== v) seen.push(v);
  });
  return { seen, stop: unsubscribe };
};

const page = (state: 'loading' | 'partial' | 'done', from: number, n: number) =>
  store.dispatch(
    applyRoomsPreloadBatch({
      rooms: [
        {
          jid: JID,
          historyPreloadState: state,
          messages: Array.from({ length: n }, (_, i) =>
            msg(`m${from + i}`, BASE + (from + i) * 1000)
          ),
        },
      ],
    })
  );

const BASE = Date.now() - 600_000;

describe('room list badge does not flicker while history replays', () => {
  beforeEach(() => {
    store.dispatch(deleteAllRooms());
    store.dispatch(setCurrentRoom({ roomJID: null }));
    store.dispatch(setChatUiVisible(true));
  });

  it('seeded room: stays on the API count while MAM replays more messages than the seed', () => {
    seed({ unreadCount: 2 });
    store.dispatch(setLastViewedTimestamp({ chatJID: JID, timestamp: BASE - 1 }));
    const { seen, stop } = recordBadge();

    page('loading', 0, 1);
    page('loading', 1, 2);
    page('loading', 3, 3);
    page('partial', 6, 1);
    stop();

    expect(seen).toEqual([2]);
  });

  it('seeded room: changes once, to the real local count, when history is done', () => {
    seed({ unreadCount: 2 });
    store.dispatch(setLastViewedTimestamp({ chatJID: JID, timestamp: BASE - 1 }));
    const { seen, stop } = recordBadge();

    page('loading', 0, 3);
    page('loading', 3, 3);
    page('done', 6, 0);
    stop();

    expect(seen).toEqual([2, 6]);
  });

  it('persisted count with no seed: not zeroed by an empty transcript, not climbed mid-replay', () => {
    seed();
    store.dispatch(setLastViewedTimestamp({ chatJID: JID, timestamp: BASE - 1 }));
    // The count rehydrated from the persisted store.
    store.dispatch(
      updateRoom({ jid: JID, updates: { unreadMessages: 3 } })
    );
    const { seen, stop } = recordBadge();

    // Recompute with nothing loaded yet (what a reload does first).
    store.dispatch(setLastViewedTimestamp({ chatJID: JID, timestamp: BASE - 1 }));
    page('loading', 0, 1);
    page('loading', 1, 1);
    page('loading', 2, 1);
    expect(room().unreadMessages).toBe(3);
    page('done', 3, 2);
    stop();

    // One transition, to the final local count.
    expect(seen).toEqual([3, 5]);
  });

  it('cold start with no persisted count and no seed: hidden (0) until settled, then appears once', () => {
    seed();
    store.dispatch(setLastViewedTimestamp({ chatJID: JID, timestamp: BASE - 1 }));
    const { seen, stop } = recordBadge();

    page('loading', 0, 2);
    page('loading', 2, 2);
    page('done', 4, 1);
    stop();

    expect(seen).toEqual([0, 5]);
  });
});
