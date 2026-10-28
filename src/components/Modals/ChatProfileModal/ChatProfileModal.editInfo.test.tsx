import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';

const patchMyChatMock = vi.hoisted(() => vi.fn());
vi.mock('../../../networking/api-requests/rooms.api', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../../networking/api-requests/rooms.api')
  >();
  return { ...actual, patchMyChat: patchMyChatMock };
});
vi.mock('../../../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: { setRoomImageStanza: vi.fn() },
    setClient: vi.fn(),
  }),
}));

import ChatProfileModal from './ChatProfileModal';

const ROOM_JID = 'room_1@conference.example.com';

const renderPanel = (roomType: 'group' | 'public' = 'group') =>
  renderWithProviders(<ChatProfileModal handleCloseModal={vi.fn()} />, {
    preloadedState: {
      chatSettingStore: {
        config: {},
        user: { xmppUsername: 'me_1', fileToken: '' },
      },
      rooms: {
        rooms: {
          [ROOM_JID]: {
            jid: ROOM_JID,
            name: 'Design team',
            title: 'Design team',
            description: 'Original description',
            type: roomType,
            role: 'moderator',
            usersCnt: 1,
            members: [],
            messages: [],
          },
        },
        activeRoomJID: ROOM_JID,
        usersSet: {},
        presenceByRoom: {},
      },
    } as any,
  });

describe('ChatProfileModal group metadata editing', () => {
  beforeEach(() => patchMyChatMock.mockReset().mockResolvedValue(undefined));

  it('patches title and description and updates the room in the store', async () => {
    const { store } = renderPanel();
    expect(screen.getByRole('button', { name: 'Add more Users' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    expect(screen.queryByRole('button', { name: 'Add more Users' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Chat name' }), {
      target: { value: 'Product team' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'Planning and delivery' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchMyChatMock).toHaveBeenCalledWith('room_1', {
        title: 'Product team',
        description: 'Planning and delivery',
      })
    );
    await waitFor(() => {
      expect(store.getState().rooms.rooms[ROOM_JID]).toMatchObject({
        name: 'Product team',
        title: 'Product team',
        description: 'Planning and delivery',
      });
    });
    expect(screen.getByRole('button', { name: 'Add more Users' })).toBeTruthy();
  });

  it('restores Add more Users after cancelling metadata editing', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    expect(screen.queryByRole('button', { name: 'Add more Users' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Add more Users' })).toBeTruthy();
  });

  it('offers the same metadata editor for public rooms owned by a moderator', () => {
    renderPanel('public');

    expect(screen.getByRole('button', { name: 'Edit profile' })).toBeTruthy();
  });

  it('keeps edit mode and stored metadata unchanged when the PATCH fails', async () => {
    patchMyChatMock.mockRejectedValueOnce(new Error('forbidden'));
    const { store } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Chat name' }), {
      target: { value: 'Unauthorized rename' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchMyChatMock).toHaveBeenCalledOnce());
    expect(screen.getByRole('textbox', { name: 'Chat name' })).toBeTruthy();
    expect(store.getState().rooms.rooms[ROOM_JID].title).toBe('Design team');
  });
});
