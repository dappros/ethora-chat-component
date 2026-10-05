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

// ChatHeader pulls the live client out of XmppProvider context, which this
// test has no business standing up: nothing here sends a stanza.
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: { leaveTheRoomStanza: vi.fn() },
    setClient: vi.fn(),
  }),
}));

import ChatHeader from './ChatHeader';

const ROOM_JID = 'room_1@conference.example.com';

const room = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'Design team',
    title: 'Design team',
    type: 'group',
    usersCnt: 4,
    members: [],
    messages: [],
    isLoading: false,
    ...overrides,
  }) as unknown as IRoom;

const renderHeader = (config: Record<string, unknown>, currentRoom = room()) => {
  const store = configureStore({
    reducer: {
      chatSettingStore: chatSettingsSlice,
      rooms: roomsSlice,
      roomHeapSlice,
      call: callSlice,
    },
    preloadedState: {
      chatSettingStore: {
        config,
        user: { xmppUsername: 'me_1', fileToken: '' },
      },
      rooms: {
        rooms: { [ROOM_JID]: currentRoom },
        activeRoomJID: ROOM_JID,
        presenceByRoom: { [ROOM_JID]: ['me_1', 'peer_1'] },
      },
    } as any,
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });

  return render(
    <Provider store={store}>
      <ToastProvider>
        <ChatHeader currentRoom={currentRoom} />
      </ToastProvider>
    </Provider>
  );
};

const members = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id: `id${i}`,
    firstName: 'F',
    lastName: String(i),
    xmppUsername: `u${i}`,
  }));

describe('ChatHeader user count on a truncated big room', () => {
  it('shows usersCnt (435), not the 30 members the API returned', () => {
    renderHeader({}, room({ usersCnt: 435, members: members(30) as any }));
    expect(screen.getByText(/435 users/)).toBeTruthy();
    expect(screen.queryByText(/^30 users/)).toBeNull();
  });

  it('falls back to members.length when usersCnt is unknown', () => {
    renderHeader({}, room({ usersCnt: 0, members: members(7) as any }));
    expect(screen.getByText(/7 users/)).toBeTruthy();
  });
});
