import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import callSlice from '../../roomStore/callSlice';
import { ToastProvider } from '../../context/ToastContext';
import { IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: { leaveTheRoomStanza: vi.fn() },
    setClient: vi.fn(),
  }),
}));

import ChatHeader from './ChatHeader';

const ROOM_JID = 'room_1@conference.example.com';

const room = {
  jid: ROOM_JID,
  name: 'A very long room title that cannot possibly fit on a phone',
  title: 'A very long room title that cannot possibly fit on a phone',
  type: 'group',
  usersCnt: 12345,
  members: [],
  messages: [],
  isLoading: false,
} as unknown as IRoom;

const renderHeader = () => {
  const store = configureStore({
    reducer: {
      chatSettingStore: chatSettingsSlice,
      rooms: roomsSlice,
      roomHeapSlice,
      call: callSlice,
    },
    preloadedState: {
      chatSettingStore: {
        config: {},
        user: { xmppUsername: 'me_1', fileToken: '' },
      },
      rooms: {
        rooms: { [ROOM_JID]: room },
        activeRoomJID: ROOM_JID,
        presenceByRoom: { [ROOM_JID]: ['me_1', 'peer_1', 'peer_2'] },
      },
    } as any,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  return render(
    <Provider store={store}>
      <ToastProvider>
        <ChatHeader currentRoom={room} />
      </ToastProvider>
    </Provider>
  );
};

describe('ChatHeader subtitle never wraps or overflows', () => {
  it('keeps the count in a nowrap ellipsis span and the online trigger as a sibling', () => {
    renderHeader();
    const count = screen.getByText(/12,345 users/);
    const countStyle = getComputedStyle(count);
    expect(countStyle.whiteSpace).toBe('nowrap');
    expect(countStyle.overflow).toBe('hidden');
    expect(countStyle.textOverflow).toBe('ellipsis');
    // The online trigger is NOT inside the clipped span (it would be cut
    // first on a narrow screen, and the popover would be clipped).
    const online = screen.getByText(/2 online|3 online|online/);
    expect(count.contains(online)).toBe(false);
    expect(count.parentElement?.contains(online)).toBe(true);
    expect(getComputedStyle(count.parentElement as HTMLElement).display).toBe(
      'flex'
    );
  });
});
