import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';

const searchMessages = vi.fn();
vi.mock(
  '../../../networking/api-requests/messageSearch.api',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../networking/api-requests/messageSearch.api')
    >()),
    MESSAGE_SEARCH_PAGE_SIZE: 20,
    searchMessages: (...a: unknown[]) => searchMessages(...a),
  })
);
vi.mock('../../../hooks/useIsMobileViewport', () => ({
  useIsMobileViewport: () => false,
}));

import MessageSearchModal from './MessageSearchModal';

const hit = (id: string, body: string) => ({
  id,
  chatId: 'room1',
  chatType: 'groupchat',
  room: 'room1@conf',
  from: 'app_u1@x',
  fromUserId: 'u1',
  body,
  messageId: id,
  stanzaId: id,
  createdAt: '2026-01-01T00:00:00Z',
});
const page = (items: any[], total = items.length) => ({
  items,
  total,
  offset: 0,
  limit: 20,
  nextOffset: items.length,
});

const roomsState = {
  rooms: {
    'room1@conf': {
      jid: 'room1@conf',
      title: 'Room',
      messages: [],
      members: [{ _id: 'u1', firstName: 'Ann', lastName: 'Lee' }],
    },
  },
  activeRoomJID: 'room1@conf',
  usersSet: {},
};

describe('MessageSearchModal results list', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('replaces the results when a filter changes them, instead of keeping stale rows', async () => {
    searchMessages
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 20 }, (_, i) => hit(`a${i}`, `old hit ${i}`)),
          66
        )
      )
      .mockResolvedValueOnce(
        page([hit('b1', 'new hit one'), hit('b2', 'new hit two')])
      );

    renderWithProviders(<MessageSearchModal handleCloseModal={() => {}} />, {
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: 'app_me' },
          config: { appId: 'app' },
        } as any,
        rooms: roomsState as any,
      },
    });

    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search messages' }),
      { target: { value: 'hit' } }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(document.querySelectorAll('ul li button')).toHaveLength(20);

    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    fireEvent.change(screen.getByPlaceholderText('Name of the sender'), {
      target: { value: 'Ann' },
    });
    fireEvent.click(screen.getByRole('option'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(searchMessages.mock.calls[1][0]).toMatchObject({ fromUserId: 'u1' });
    const rows = Array.from(document.querySelectorAll('ul li button')).map(
      (b) => b.textContent
    );
    expect(rows).toHaveLength(2);
    expect(rows.join(' ')).toContain('new hit one');
    expect(rows.join(' ')).not.toContain('old hit');
  });
});
