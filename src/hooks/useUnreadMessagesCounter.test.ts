import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { store } from '../roomStore';
import { addRoom, setLogoutState, updateRoom } from '../roomStore/roomsSlice';
import { useUnread } from './useUnreadMessagesCounter';

const ROOM = 'r1@conference.example.com';

const seedRoom = (count: number) => {
  store.dispatch(
    addRoom({
      roomData: {
        jid: ROOM,
        name: 'R1',
        title: 'R1',
        usersCnt: 2,
        messages: [],
        isLoading: false,
        roomBg: null,
        unreadMessages: count,
      } as never,
    })
  );
};

// addRoom keeps an existing room's unread; updateRoom is the path that
// actually changes the count (mirrors the unread middleware writing it).
const setUnread = (count: number) => {
  store.dispatch(updateRoom({ jid: ROOM, updates: { unreadMessages: count } }));
};

describe('useUnread loading settle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    store.dispatch(setLogoutState());
  });
  afterEach(() => {
    vi.useRealTimers();
    store.dispatch(setLogoutState());
  });

  it('stays loading while counts change, then latches to false once stable', () => {
    seedRoom(2);
    const { result } = renderHook(() => useUnread());

    expect(result.current.loading).toBe(true);

    // Count changes within the window → window resets, still loading.
    act(() => {
      setUnread(3);
      vi.advanceTimersByTime(800);
    });
    expect(result.current.loading).toBe(true);

    act(() => {
      setUnread(5);
      vi.advanceTimersByTime(800);
    });
    expect(result.current.loading).toBe(true);

    // Stable past the settle window → loading latches false with final count.
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.totalCount).toBe(5);
  });

  it('does not flip loading back on for live updates after settling', () => {
    seedRoom(0);
    const { result } = renderHook(() => useUnread());
    // Set the count explicitly (the unread middleware zeroes an empty room on
    // addRoom), then let it settle.
    act(() => {
      setUnread(1);
      vi.advanceTimersByTime(1300);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.totalCount).toBe(1);

    // A later live increment updates the count but keeps loading false.
    act(() => {
      setUnread(2);
      vi.advanceTimersByTime(50);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.totalCount).toBe(2);
  });
});
