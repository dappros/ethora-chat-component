import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import RoomList from './RoomList';
import { IRoom } from '../../types/types';

// RoomList reads the xmpp client via context - sidestep mounting a real
// XmppProvider, same pattern as MessageList.markRead.test.tsx.
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null, setClient: vi.fn() }),
}));

// The real Files panel fetches /v2/files and has its own tests; here we only
// care that the tab switcher mounts it.
vi.mock('../Files/FilesPanel', () => ({
  default: () => <div>files-panel-stub</div>,
}));

const room = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: 'room1@conference.example.com',
    title: 'Room One',
    name: 'Room One',
    messages: [],
    unreadMessages: 0,
    ...overrides,
  }) as IRoom;

describe('RoomList - tab switcher', () => {
  it('shows the segmented Chats/Files control by default and switches tabs', () => {
    renderWithProviders(<RoomList chats={[room()]} />);

    expect(screen.getByRole('tab', { name: 'Chats' })).toBeInTheDocument();
    const filesTab = screen.getByRole('tab', { name: 'Files' });
    expect(filesTab).toBeInTheDocument();

    // Chat rows are visible on the default "chats" tab.
    expect(screen.getByText('Room One')).toBeInTheDocument();

    fireEvent.click(filesTab);

    // Switching to "files" mounts the Files placeholder and hides the room row.
    expect(screen.getByText('files-panel-stub')).toBeInTheDocument();
    expect(screen.queryByText('Room One')).not.toBeInTheDocument();
  });

  it('hides the tab switcher when config.filesTab.enabled is false', () => {
    renderWithProviders(
      <RoomList chats={[room()]} />, // eslint-disable-line
      {
        preloadedState: {
          chatSettingStore: {
            config: { filesTab: { enabled: false } },
          } as any,
        },
      }
    );

    expect(screen.queryByRole('tab', { name: 'Files' })).not.toBeInTheDocument();
    expect(screen.getByText('Room One')).toBeInTheDocument();
  });
});

describe('RoomList - loading skeleton', () => {
  it('renders skeleton rows instead of an empty list while rooms are loading', () => {
    renderWithProviders(<RoomList chats={[]} />, {
      preloadedState: {
        rooms: { isLoading: true, rooms: {}, activeRoomJID: null } as any,
      },
    });

    expect(screen.getByTestId('rooms_list').children.length).toBeGreaterThan(0);
    expect(screen.queryByText('Room One')).not.toBeInTheDocument();
  });
});
