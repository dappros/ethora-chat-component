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

describe('ChatHeader host customisation', () => {
  describe('config.headerLogo', () => {
    it('renders no logo by default', () => {
      renderHeader({});
      expect(document.querySelector('img')).toBeNull();
    });

    it('renders a string logo as an image in the header', () => {
      renderHeader({ headerLogo: 'https://acme.test/logo.png' });

      const img = document.querySelector('img') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.getAttribute('src')).toBe('https://acme.test/logo.png');
    });

    it('renders an element logo as given', () => {
      renderHeader({
        headerLogo: <span data-testid="acme-mark">ACME</span>,
      });

      expect(screen.getByTestId('acme-mark').textContent).toBe('ACME');
    });
  });

  describe('config.disableUserCount', () => {
    it('shows the member count subtitle by default', () => {
      renderHeader({});
      expect(screen.getByText(/4 users/)).toBeTruthy();
    });

    it('hides the member count and the online popover when set', () => {
      renderHeader({ disableUserCount: true });

      expect(screen.queryByText(/4 users/)).toBeNull();
      // The online-users popover hangs off the same subtitle, so it goes too.
      expect(screen.queryByText(/online/)).toBeNull();
    });

    it('leaves the 1:1 presence line alone: it is a state, not a count', () => {
      renderHeader(
        { disableUserCount: true },
        room({
          type: 'private',
          members: [{ xmppUsername: 'peer_1' }],
        } as Partial<IRoom>)
      );

      expect(screen.getByText('online')).toBeTruthy();
    });
  });
});
