import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';

vi.mock('../../../networking/api-requests/messageSearch.api', async (orig) => ({
  ...(await orig<typeof import('../../../networking/api-requests/messageSearch.api')>()),
  searchMessages: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    offset: 0,
    limit: 20,
    nextOffset: 0,
  }),
}));
vi.mock('../../../hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => false,
}));
const dir = vi.hoisted(() => ({ members: [] as any[], ensure: vi.fn() }));
vi.mock('../../../helpers/userResolver', () => ({
  ensureRoomDirectory: (...a: unknown[]) => dir.ensure(...a),
  getRoomDirectoryMembers: () => dir.members,
  getRoomDirectoryState: () => 'done',
  subscribeUserResolver: () => () => {},
}));

import MessageSearchModal from './MessageSearchModal';

const roomsState = (usersCnt: number) => ({
  rooms: {
    'room1@conf': {
      jid: 'room1@conf',
      title: 'Room',
      messages: [],
      usersCnt,
      members: [{ _id: 'u1', firstName: 'Ann', lastName: 'Lee', xmppUsername: 'app_u1' }],
    },
  },
  activeRoomJID: 'room1@conf',
  usersSet: {},
});

const open = (usersCnt: number) => {
  renderWithProviders(<MessageSearchModal handleCloseModal={() => {}} />, {
    preloadedState: {
      chatSettingStore: {
        user: { xmppUsername: 'app_me' },
        config: { appId: 'app' },
      } as any,
      rooms: roomsState(usersCnt) as any,
    },
  });
  fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
};

describe('MessageSearchModal sender filter on a truncated room', () => {
  beforeEach(() => {
    dir.members = [];
    dir.ensure.mockReset();
  });

  it('loads the directory and offers directory users beyond the first members', () => {
    dir.members = [
      { _id: 'u2', firstName: 'Zed', lastName: 'Far', xmppUsername: 'app_u2' },
    ];
    open(435);
    expect(dir.ensure).toHaveBeenCalledWith('room1@conf');
    fireEvent.change(screen.getByPlaceholderText('Name of the sender'), {
      target: { value: 'Zed' },
    });
    expect(screen.getByRole('option', { name: 'Zed Far' })).toBeTruthy();
  });

  it('does not load a directory for a complete room', () => {
    open(1);
    expect(dir.ensure).not.toHaveBeenCalled();
  });
});
