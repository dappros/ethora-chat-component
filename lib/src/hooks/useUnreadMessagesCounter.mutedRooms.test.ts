import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { store } from '../roomStore';
import {
  addRoom,
  setLogoutState,
  setRoomMuted,
  updateRoom,
} from '../roomStore/roomsSlice';
import { useUnread } from './useUnreadMessagesCounter';

const ROOM_A = 'a@conference.example.com';
const ROOM_B = 'b@conference.example.com';

// addRoom's own `unreadMessages` gets immediately recomputed (to 0, since
// there are no messages) by the unread middleware - the same reason the
// existing useUnread test file sets counts via updateRoom instead of trusting
// addRoom's payload. `updateRoom` with ONLY unread-shaped fields is the one
// action the middleware deliberately lets through unrecomputed.
const seedRoom = (jid: string, count: number) => {
  store.dispatch(
    addRoom({
      roomData: {
        jid,
        name: jid,
        title: jid,
        usersCnt: 2,
        messages: [],
        isLoading: false,
        roomBg: null,
      } as never,
    })
  );
  store.dispatch(updateRoom({ jid, updates: { unreadMessages: count } }));
};

// A muted room's own unread count keeps working (its row badge still shows
// it) - it's the AGGREGATE total that must not count it, so a muted chat
// never lights up the app-wide unread indicator.
describe('useUnread excludes muted rooms from the aggregated total', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    store.dispatch(setLogoutState());
  });
  afterEach(() => {
    vi.useRealTimers();
    store.dispatch(setLogoutState());
  });

  it('keeps a muted room out of totalCount/hasUnread but keeps its own per-room badge', () => {
    seedRoom(ROOM_A, 3);
    seedRoom(ROOM_B, 2);
    store.dispatch(setRoomMuted({ jid: ROOM_B, muted: true }));

    const { result } = renderHook(() => useUnread());
    act(() => {
      vi.advanceTimersByTime(1300);
    });

    expect(result.current.totalCount).toBe(3);
    expect(result.current.hasUnread).toBe(true);
    expect(result.current.unreadByRoom[ROOM_B]).toBe(2);
    expect(result.current.displayByRoom[ROOM_B]).toBe('2');
  });

  it('hasUnread is false when only a muted room has unread messages', () => {
    seedRoom(ROOM_A, 0);
    seedRoom(ROOM_B, 4);
    store.dispatch(setRoomMuted({ jid: ROOM_B, muted: true }));

    const { result } = renderHook(() => useUnread());
    act(() => {
      vi.advanceTimersByTime(1300);
    });

    expect(result.current.totalCount).toBe(0);
    expect(result.current.hasUnread).toBe(false);
    expect(result.current.unreadByRoom[ROOM_B]).toBe(4);
  });

  it('updates totalCount live when a room is muted after the counts have already settled', () => {
    seedRoom(ROOM_A, 3);
    const { result } = renderHook(() => useUnread());
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(result.current.totalCount).toBe(3);

    act(() => {
      store.dispatch(setRoomMuted({ jid: ROOM_A, muted: true }));
    });
    expect(result.current.totalCount).toBe(0);

    act(() => {
      store.dispatch(setRoomMuted({ jid: ROOM_A, muted: false }));
    });
    expect(result.current.totalCount).toBe(3);
  });
});
