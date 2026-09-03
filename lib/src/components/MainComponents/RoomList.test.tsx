import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import RoomList from './RoomList';
import { IRoom } from '../../types/types';
import { getMyFiles } from '../../networking/api-requests/files.api';
import http from '../../networking/apiClient';

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

// files.api talks to the real apiClient http instance; mock just its get()
// so getMyFiles() can be driven to a 404 without a network layer.
vi.mock('../../networking/apiClient', () => ({
  default: { get: vi.fn(), delete: vi.fn() },
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

afterEach(async () => {
  const { __resetFilesEndpointSupportForTests } = await import(
    '../../networking/api-requests/files.api'
  );
  __resetFilesEndpointSupportForTests();
});

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

  it('hides the Files tab once the backend proves /v2/files is unsupported (404)', async () => {
    // config.filesTab.enabled is left unset (auto-detect). Drive the module-
    // level support state the same way a real 404 response would: through
    // getMyFiles() itself, so this exercises the actual detection path
    // rather than a hook mock.
    const axios404 = Object.assign(new Error('Not Found'), {
      response: { status: 404 },
    });
    vi.mocked(http.get).mockRejectedValueOnce(axios404);
    await expect(getMyFiles({ limit: 50, offset: 0 })).rejects.toBe(axios404);

    renderWithProviders(<RoomList chats={[room()]} />);

    await waitFor(() =>
      expect(
        screen.queryByRole('tab', { name: 'Files' })
      ).not.toBeInTheDocument()
    );
    // Falls back to the chats view (the only view left) rather than a
    // blank/dead panel.
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

    // Exactly SKELETON_ROW_COUNT placeholder rows, not just "some children" -
    // a regression that rendered zero, one, or the wrong shape of skeleton
    // markup would previously still pass this assertion.
    expect(screen.getByTestId('rooms_list').children).toHaveLength(6);
    expect(screen.queryByText('Room One')).not.toBeInTheDocument();
  });
});
