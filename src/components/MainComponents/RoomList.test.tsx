import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';

// `useXmppClient` reads from a Context that throws if no XmppProvider
// is in the tree. We stub it to return inert handles — RoomList only
// touches `client` on the leave-chat / mute paths the tests don't
// exercise.
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: { close: vi.fn(), unsubscribeFromChat: vi.fn() },
    setClient: vi.fn(),
  }),
}));

// `logoutService` reaches into a real network/store cleanup pipeline;
// stub it out so the menu-options memo doesn't blow up during render.
vi.mock('../../hooks/useLogout', () => ({
  logoutService: { performLogout: vi.fn() },
}));

import RoomList from './RoomList';
import { renderWithProviders } from '../../test/renderWithProviders';
import { RoomListTestIds } from '../../testIds';
import { IRoom } from '../../types/types';

const makeRoom = (id: string, overrides: Partial<IRoom> = {}): IRoom => ({
  name: `room-${id}`,
  jid: `${id}@conference.test`,
  title: `Room ${id}`,
  usersCnt: 0,
  messages: [],
  isLoading: false,
  roomBg: '',
  ...overrides,
});

describe('<RoomList />', () => {
  test('renders the rooms list container, search input, and create button', () => {
    renderWithProviders(<RoomList chats={[makeRoom('a'), makeRoom('b')]} />);

    expect(screen.getByTestId(RoomListTestIds.roomsList)).toBeInTheDocument();
    expect(screen.getByTestId(RoomListTestIds.searchInput)).toBeInTheDocument();
    // The "+" trigger inside NewChatModal carries createRoomButton —
    // it renders unconditionally on this default config.
    expect(
      screen.getByTestId(RoomListTestIds.createRoomButton)
    ).toBeInTheDocument();
  });

  test('renders one room row per chat', () => {
    renderWithProviders(
      <RoomList chats={[makeRoom('a'), makeRoom('b'), makeRoom('c')]} />
    );
    const rows = screen.getAllByTestId(RoomListTestIds.roomRow);
    expect(rows.length).toBe(3);
  });

  test('typing in the search input filters the room rows by title', () => {
    renderWithProviders(
      <RoomList
        chats={[
          makeRoom('alpha', { title: 'Alpha chat' }),
          makeRoom('bravo', { title: 'Bravo room' }),
          makeRoom('charlie', { title: 'Charlie thread' }),
        ]}
      />
    );
    const search = screen.getByTestId(RoomListTestIds.searchInput);
    fireEvent.change(search, { target: { value: 'brav' } });
    // Only the Bravo row should survive the filter.
    const rows = screen.getAllByTestId(RoomListTestIds.roomRow);
    expect(rows.length).toBe(1);
    expect(within(rows[0]).getByText(/bravo/i)).toBeInTheDocument();
  });

  test('clicking a room row fires onRoomClick with that room', () => {
    const onRoomClick = vi.fn();
    renderWithProviders(
      <RoomList
        chats={[makeRoom('a'), makeRoom('b')]}
        onRoomClick={onRoomClick}
      />
    );
    const rows = screen.getAllByTestId(RoomListTestIds.roomRow);
    fireEvent.click(rows[1]);
    expect(onRoomClick).toHaveBeenCalledTimes(1);
    expect(onRoomClick).toHaveBeenCalledWith(
      expect.objectContaining({ jid: 'b@conference.test' })
    );
  });

  test('hides the search input when config.chatHeaderSettings.hideSearch is true', () => {
    renderWithProviders(<RoomList chats={[makeRoom('a')]} />, {
      preloadedState: {
        chatSettingStore: {
          user: null,
          activeFile: null,
          activeModal: null,
          config: { chatHeaderSettings: { hideSearch: true } },
          deleteModal: null,
          selectedUser: null,
          langSource: null,
        },
      } as Parameters<typeof renderWithProviders>[1]['preloadedState'],
    });
    expect(screen.queryByTestId(RoomListTestIds.searchInput)).toBeNull();
  });

  test('hides the create button when config.chatHeaderSettings.disableCreate is true', () => {
    renderWithProviders(<RoomList chats={[makeRoom('a')]} />, {
      preloadedState: {
        chatSettingStore: {
          user: null,
          activeFile: null,
          activeModal: null,
          config: { chatHeaderSettings: { disableCreate: true } },
          deleteModal: null,
          selectedUser: null,
          langSource: null,
        },
      } as Parameters<typeof renderWithProviders>[1]['preloadedState'],
    });
    expect(screen.queryByTestId(RoomListTestIds.createRoomButton)).toBeNull();
  });
});
