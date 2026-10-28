import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';

const patchMyChatMock = vi.hoisted(() => vi.fn());
const uploadFileMock = vi.hoisted(() => vi.fn());
const setRoomImageStanzaMock = vi.hoisted(() => vi.fn());
vi.mock('../../../networking/api-requests/rooms.api', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../../networking/api-requests/rooms.api')
  >();
  return { ...actual, patchMyChat: patchMyChatMock };
});
vi.mock('../../../networking/api-requests/auth.api', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../../networking/api-requests/auth.api')
  >();
  return { ...actual, uploadFile: uploadFileMock };
});
vi.mock('../../../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: { setRoomImageStanza: setRoomImageStanzaMock },
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
            name: 'room_1',
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
  beforeEach(() => {
    patchMyChatMock.mockReset().mockResolvedValue(undefined);
    uploadFileMock.mockReset().mockResolvedValue({
      data: { results: [{ location: 'https://cdn.example.com/chat.png' }] },
    });
    setRoomImageStanzaMock.mockReset();
  });

  it('persists an uploaded icon through REST without sending the legacy XMPP profile IQ', async () => {
    const { store, container } = renderPanel();
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    const file = new File(['avatar'], 'chat.png', { type: 'image/png' });

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() =>
      expect(patchMyChatMock).toHaveBeenCalledWith('room_1', {
        picture: 'https://cdn.example.com/chat.png',
      })
    );
    await waitFor(() =>
      expect(store.getState().rooms.rooms[ROOM_JID]).toMatchObject({
        icon: 'https://cdn.example.com/chat.png',
        picture: 'https://cdn.example.com/chat.png',
      })
    );
    expect(setRoomImageStanzaMock).not.toHaveBeenCalled();
  });

  it('does not update the icon when persisting the upload fails', async () => {
    patchMyChatMock.mockRejectedValueOnce(new Error('forbidden'));
    const { store, container } = renderPanel();
    const input = container.querySelector('input[type="file"]');
    const file = new File(['avatar'], 'chat.png', { type: 'image/png' });

    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(patchMyChatMock).toHaveBeenCalledOnce());
    expect(store.getState().rooms.rooms[ROOM_JID].icon).toBeUndefined();
    expect(setRoomImageStanzaMock).not.toHaveBeenCalled();
  });

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
        name: 'room_1',
        title: 'Product team',
        description: 'Planning and delivery',
      });
    });
    expect(screen.getByText('Product team')).toBeTruthy();
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
