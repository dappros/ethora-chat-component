import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../roomStore';
import { addRoom, setCurrentRoom } from '../roomStore/roomsSlice';
import { useRoomHistorySync } from './useRoomHistorySync';

const A = 'histroom-a@conference.example.com';
const B = 'histroom-b@conference.example.com';
const room = (jid: string) =>
  ({ jid, name: jid, title: jid, usersCnt: 0, messages: [], isLoading: false, roomBg: null }) as any;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <Provider store={store}>{children}</Provider>
);

const go = (search: string) => {
  window.history.replaceState(null, '', `/chat${search}`);
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
};

describe('useRoomHistorySync', () => {
  beforeEach(() => {
    store.dispatch(addRoom({ roomData: room(A) }));
    store.dispatch(addRoom({ roomData: room(B) }));
    store.dispatch(setCurrentRoom({ roomJID: A }));
  });
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('Back to an entry without ?chatId closes the room, like the header back arrow', () => {
    const showRoom = vi.fn();
    renderHook(() => useRoomHistorySync(true, showRoom), { wrapper });
    go('');
    expect(showRoom).toHaveBeenCalledWith(false);
  });

  it('Forward to a ?chatId entry opens that room', () => {
    const showRoom = vi.fn();
    renderHook(() => useRoomHistorySync(true, showRoom), { wrapper });
    go('?chatId=histroom-b');
    expect(store.getState().rooms.activeRoomJID).toBe(B);
    expect(showRoom).toHaveBeenCalledWith(true);
  });

  it('ignores an unknown room id', () => {
    const showRoom = vi.fn();
    renderHook(() => useRoomHistorySync(true, showRoom), { wrapper });
    go('?chatId=nope');
    expect(showRoom).not.toHaveBeenCalled();
    expect(store.getState().rooms.activeRoomJID).toBe(A);
  });

  it('does nothing when the host does not keep the room in the URL', () => {
    const showRoom = vi.fn();
    renderHook(() => useRoomHistorySync(false, showRoom), { wrapper });
    go('');
    expect(showRoom).not.toHaveBeenCalled();
  });
});
