import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import { Message } from './Message';
import { IMessage, IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: { sendMessageReactionStanza: vi.fn() } }),
}));

const ROOM_JID = 'room1@conference.example.com';

const makeMediaMessage = (overrides: Partial<IMessage> = {}): IMessage =>
  ({
    id: 'm1',
    body: 'media',
    date: new Date().toISOString(),
    roomJid: ROOM_JID,
    user: { id: 'me', name: 'Me' },
    isMediafile: 'true',
    mimetype: 'image/png',
    location: 'https://example.com/a.png',
    locationPreview: 'https://example.com/a-preview.png',
    ...overrides,
  }) as IMessage;

const makeRoom = (messages: IMessage[]): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages,
    isLoading: false,
    roomBg: null,
  }) as IRoom;

function renderMessage(message: IMessage, room: IRoom) {
  return renderWithProviders(
    <Message message={message} isUser={true} isReply={false} />,
    {
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: 'me' }, config: {} } as any,
        rooms: { rooms: { [ROOM_JID]: room }, usersSet: {} } as any,
      },
    }
  );
}

describe('Message - album grid grouping', () => {
  it('renders a grid for the first message of an album with all siblings', () => {
    const album = [
      makeMediaMessage({ id: 'm1', albumId: 'album-1' }),
      makeMediaMessage({ id: 'm2', albumId: 'album-1' }),
      makeMediaMessage({ id: 'm3', albumId: 'album-1' }),
    ];
    const { container } = renderMessage(album[0], makeRoom(album));

    // 3 image tiles should render inside the grid.
    expect(container.querySelectorAll('img').length).toBe(3);
  });

  it('renders nothing for a non-first album sibling', () => {
    const album = [
      makeMediaMessage({ id: 'm1', albumId: 'album-1' }),
      makeMediaMessage({ id: 'm2', albumId: 'album-1' }),
    ];
    const { container } = renderMessage(album[1], makeRoom(album));

    expect(container.querySelectorAll('img').length).toBe(0);
  });

  it('falls back to a single media render when albumId has no siblings', () => {
    const message = makeMediaMessage({ id: 'm1', albumId: 'album-lonely' });
    const { container } = renderMessage(message, makeRoom([message]));

    expect(container.querySelectorAll('img').length).toBe(1);
  });

  it('shows a spinner overlay on a pending single media message', () => {
    const message = makeMediaMessage({ id: 'm1', pending: true });
    const { container } = renderMessage(message, makeRoom([message]));

    expect(container.querySelector('[size="28"]')).toBeTruthy();
  });

  it('shows an error badge on a failed single media message', () => {
    const message = makeMediaMessage({ id: 'm1', sendFailed: true });
    const { container, getByTitle } = renderMessage(message, makeRoom([message]));

    expect(getByTitle('Failed to send')).toBeTruthy();
    expect(container.querySelectorAll('img').length).toBe(1);
  });
});
