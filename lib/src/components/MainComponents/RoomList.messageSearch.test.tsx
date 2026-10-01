import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null, setClient: vi.fn() }),
}));

const searchMessages = vi.fn();
vi.mock(
  '../../networking/api-requests/messageSearch.api',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../networking/api-requests/messageSearch.api')
    >()),
    searchMessages: (...a: unknown[]) => searchMessages(...a),
  })
);

import RoomList from './RoomList';

const hit = (id: string, body: string, room = 'room2@conf') => ({
  id,
  chatId: room.split('@')[0],
  chatType: 'groupchat',
  room,
  from: 'app_u1@x',
  fromUserId: 'u1',
  body,
  messageId: id,
  stanzaId: id,
  createdAt: '2026-01-01T00:00:00Z',
});
const page = (items: any[]) => ({
  items,
  total: items.length,
  offset: 0,
  limit: 20,
  nextOffset: items.length,
});

const room = (jid: string, title: string) => ({
  jid,
  id: jid,
  name: title,
  title,
  messages: [],
  members: [],
});
const room1 = room('room1@conf', 'Alpha');
const room2 = room('room2@conf', 'Beta');

const renderList = (
  config: Record<string, unknown>,
  onRoomClick?: (chat: any) => void
) => {
  const storeRef = { current: null as any };
  renderWithProviders(
    <RoomList chats={[room1, room2] as any} onRoomClick={onRoomClick} />,
    {
      storeRef,
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: 'app_me' },
          config: { chatHeaderSettings: { disableCreate: true }, ...config },
        } as any,
        rooms: {
          rooms: { 'room1@conf': room1, 'room2@conf': room2 },
          activeRoomJID: 'room1@conf',
          usersSet: {},
          pendingJump: null,
        } as any,
      },
    }
  );
  return storeRef;
};

const type = async (value: string) => {
  fireEvent.change(screen.getByTestId('rooms_search_input'), {
    target: { value },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
};

describe('RoomList message search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchMessages.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('shows matching message snippets under the chats when appId is set', async () => {
    searchMessages.mockResolvedValue(
      page([hit('m1', 'please pay the invoice today')])
    );
    renderList({ appId: 'app' });

    await type('invoice');

    expect(searchMessages).toHaveBeenCalledTimes(1);
    const block = screen.getByTestId('room-list-message-matches');
    expect(block.textContent).toContain('please pay the');
    expect(block.querySelector('mark')?.textContent?.toLowerCase()).toBe(
      'invoice'
    );
  });

  it('never searches messages when disableMessageSearch is true', async () => {
    renderList({ appId: 'app', disableMessageSearch: true });

    await type('invoice');

    expect(searchMessages).not.toHaveBeenCalled();
    expect(screen.queryByTestId('room-list-message-matches')).toBeNull();
  });

  it('never searches messages without an appId', async () => {
    renderList({});

    await type('invoice');

    expect(searchMessages).not.toHaveBeenCalled();
    expect(screen.queryByTestId('room-list-message-matches')).toBeNull();
  });

  it('does not search for a single character', async () => {
    renderList({ appId: 'app' });

    await type('i');

    expect(searchMessages).not.toHaveBeenCalled();
    expect(screen.queryByTestId('room-list-message-matches')).toBeNull();
  });

  it('opens the hit room through onRoomClick and queues a jump to the message', async () => {
    searchMessages.mockResolvedValue(
      page([hit('m1', 'please pay the invoice today')])
    );
    const onRoomClick = vi.fn();
    const storeRef = renderList({ appId: 'app' }, onRoomClick);

    await type('invoice');

    const block = screen.getByTestId('room-list-message-matches');
    fireEvent.click(block.querySelector('button') as HTMLElement);

    expect(onRoomClick).toHaveBeenCalledTimes(1);
    expect(onRoomClick.mock.calls[0][0].jid).toBe('room2@conf');
    const state = storeRef.current.getState().rooms;
    expect(state.pendingJump).toMatchObject({
      roomJID: 'room2@conf',
      ids: ['m1', 'm1'],
    });
    expect(state.activeRoomJID).toBe('room2@conf');
  });

  it('does not call onRoomClick for a hit in the room that is already active', async () => {
    searchMessages.mockResolvedValue(
      page([hit('m9', 'the invoice again', 'room1@conf')])
    );
    const onRoomClick = vi.fn();
    const storeRef = renderList({ appId: 'app' }, onRoomClick);

    await type('invoice');

    const block = screen.getByTestId('room-list-message-matches');
    fireEvent.click(block.querySelector('button') as HTMLElement);

    expect(onRoomClick).not.toHaveBeenCalled();
    expect(storeRef.current.getState().rooms.pendingJump?.roomJID).toBe(
      'room1@conf'
    );
  });
});
