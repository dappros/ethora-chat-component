import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { store } from '../roomStore';
import {
  addRoomViaApi,
  applyRoomsPreloadBatch,
  deleteAllRooms,
  setChatUiVisible,
  setCurrentRoom,
  setLastViewedTimestamp,
} from '../roomStore/roomsSlice';
import { createRoomFromApi } from '../helpers/createRoomFromApi';
import { IRoom } from '../types/types';
import { useUnread } from './useUnreadMessagesCounter';

const SERVICE = 'conference.example.com';
const JID = `app_room1@${SERVICE}`;
const BASE = Date.now() - 600_000;

const msgs = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${from + i}`,
    body: 'x',
    date: new Date(BASE + (from + i) * 1000).toISOString(),
    roomJid: JID,
    user: { id: 'peer-1', name: 'peer-1' },
  })) as never[];

const batch = (state: 'loading' | 'partial' | 'done', from: number, n: number) =>
  act(() => {
    store.dispatch(
      applyRoomsPreloadBatch({
        rooms: [{ jid: JID, historyPreloadState: state, messages: msgs(from, n) }],
      })
    );
  });

describe('useUnread totals (harness top bar) during a history replay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    store.dispatch(deleteAllRooms());
    store.dispatch(setCurrentRoom({ roomJID: null }));
    store.dispatch(setChatUiVisible(true));
  });
  afterEach(() => {
    vi.useRealTimers();
    store.dispatch(deleteAllRooms());
  });

  it('totalCount is the API seed from the first render and never takes an intermediate value', () => {
    act(() => {
      store.dispatch(
        addRoomViaApi({
          room: createRoomFromApi(
            { name: 'app_room1', type: 'group', title: 'R', unreadCount: 2 },
            SERVICE
          ) as IRoom,
          xmpp: {} as never,
        })
      );
      store.dispatch(setLastViewedTimestamp({ chatJID: JID, timestamp: BASE - 1 }));
    });

    const seen: number[] = [];
    const { result } = renderHook(() => {
      const r = useUnread();
      if (seen[seen.length - 1] !== r.totalCount) seen.push(r.totalCount);
      return r;
    });

    batch('loading', 0, 2);
    batch('loading', 2, 3);
    batch('partial', 5, 1);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(seen).toEqual([2]);
    expect(result.current.loading).toBe(false);
    expect(result.current.totalCount).toBe(2);
  });
});
