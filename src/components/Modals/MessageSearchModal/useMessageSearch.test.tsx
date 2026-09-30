import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const searchMessages = vi.fn();
vi.mock('../../../networking/api-requests/messageSearch.api', () => ({
  MESSAGE_SEARCH_PAGE_SIZE: 20,
  searchMessages: (...a: unknown[]) => searchMessages(...a),
}));

import { useMessageSearch } from './useMessageSearch';

const hit = (id: string) => ({
  chatId: 'r',
  chatType: 'groupchat',
  room: 'r@c',
  from: 'u',
  fromUserId: 'u',
  body: 'b',
  messageId: id,
  stanzaId: id,
  createdAt: '2026-01-01T00:00:00Z',
});
const page = (ids: string[], total: number, nextOffset: number) => ({
  items: ids.map(hit),
  total,
  offset: 0,
  limit: 20,
  nextOffset,
});

describe('useMessageSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchMessages.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('waits for two characters and debounces typing into one request', async () => {
    searchMessages.mockResolvedValue(page(['1'], 1, 1));
    const { result, rerender } = renderHook(
      ({ q }) => useMessageSearch(q, 'chat', 'r'),
      {
        initialProps: { q: 'h' },
      }
    );
    expect(result.current.searchable).toBe(false);

    rerender({ q: 'he' });
    rerender({ q: 'hel' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(searchMessages).toHaveBeenCalledTimes(1);
    expect(searchMessages.mock.calls[0][0]).toMatchObject({
      q: 'hel',
      chatId: 'r',
      offset: 0,
    });
    expect(result.current.items).toHaveLength(1);
  });

  it('drops a slow answer that was superseded by a newer query', async () => {
    let resolveOld!: (v: unknown) => void;
    searchMessages
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce(page(['new'], 1, 1));

    const { result, rerender } = renderHook(
      ({ q }) => useMessageSearch(q, 'all'),
      {
        initialProps: { q: 'he' },
      }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    rerender({ q: 'hello' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await act(async () => {
      resolveOld(page(['old'], 1, 1));
    });

    expect(result.current.items.map((h) => h.stanzaId)).toEqual(['new']);
  });

  it('pages by server rows and never repeats a hit', async () => {
    searchMessages
      .mockResolvedValueOnce(page(['1', '2'], 5, 3)) // one row was hidden server-side
      .mockResolvedValueOnce(page(['2', '4'], 5, 5)); // overlap: '2' again

    const { result } = renderHook(() => useMessageSearch('hello', 'all'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.loadMore();
    });

    expect(searchMessages.mock.calls[1][0]).toMatchObject({ offset: 3 });
    expect(result.current.items.map((h) => h.stanzaId)).toEqual([
      '1',
      '2',
      '4',
    ]);
    expect(result.current.hasMore).toBe(false);
  });

  it('reports a failed request so the panel can offer a retry', async () => {
    searchMessages.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useMessageSearch('hello', 'all'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(result.current.status).toBe('error');
  });
});
