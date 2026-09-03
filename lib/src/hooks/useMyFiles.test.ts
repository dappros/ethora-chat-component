import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import chatSettingsSlice from '../roomStore/chatSettingsSlice';

const getMyFilesMock = vi.fn();
const deleteMyFileMock = vi.fn();

vi.mock('../networking/api-requests/files.api', () => ({
  getMyFiles: (...args: unknown[]) => getMyFilesMock(...args),
  deleteMyFile: (...args: unknown[]) => deleteMyFileMock(...args),
}));

import { useMyFiles } from './useMyFiles';

let tokenCounter = 0;

const makeWrapper = (token: string) => {
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsSlice },
    preloadedState: {
      chatSettingStore: { user: { token } } as never,
    },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, { store }, children);
};

const nextToken = () => `token-${++tokenCounter}`;

const file = (id: string, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  originalname: `file-${id}`,
  mimetype: 'application/pdf',
  size: 100,
  roomName: 'general',
  ...overrides,
});

describe('useMyFiles', () => {
  beforeEach(() => {
    getMyFilesMock.mockReset();
    deleteMyFileMock.mockReset();
  });

  it('loads the first page on mount', async () => {
    const token = nextToken();
    getMyFilesMock.mockResolvedValue({
      items: [file('1'), file('2')],
      total: 2,
      limit: 50,
      offset: 0,
    });

    const { result } = renderHook(() => useMyFiles(), {
      wrapper: makeWrapper(token),
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getMyFilesMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 })
    );
    expect(result.current.items).toHaveLength(2);
    expect(result.current.total).toBe(2);
    expect(result.current.hasMore).toBe(false);
  });

  it('loadMore appends the next page using the current item count as offset', async () => {
    const token = nextToken();
    getMyFilesMock
      .mockResolvedValueOnce({
        items: [file('1')],
        total: 3,
        limit: 1,
        offset: 0,
      })
      .mockResolvedValueOnce({
        items: [file('2')],
        total: 3,
        limit: 1,
        offset: 1,
      });

    const { result } = renderHook(() => useMyFiles(), {
      wrapper: makeWrapper(token),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMore).toBe(true);

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(getMyFilesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 1 })
    );
  });

  it('remove() optimistically removes the file, and rolls back on API failure', async () => {
    const token = nextToken();
    getMyFilesMock.mockResolvedValue({
      items: [file('1'), file('2')],
      total: 2,
      limit: 50,
      offset: 0,
    });
    deleteMyFileMock.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useMyFiles(), {
      wrapper: makeWrapper(token),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.remove('1')).rejects.toThrow('boom');
    });

    // Rolled back: the file is back and the count is restored.
    expect(result.current.items.map((f) => f._id)).toEqual(['1', '2']);
    expect(result.current.total).toBe(2);
    expect(result.current.error).toBeTruthy();
  });

  it('remove() keeps the file gone when the API call succeeds', async () => {
    const token = nextToken();
    getMyFilesMock.mockResolvedValue({
      items: [file('1'), file('2')],
      total: 2,
      limit: 50,
      offset: 0,
    });
    deleteMyFileMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMyFiles(), {
      wrapper: makeWrapper(token),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('1');
    });

    expect(result.current.items.map((f) => f._id)).toEqual(['2']);
    expect(result.current.total).toBe(1);
  });

  it('applies the roomName filter client-side', async () => {
    const token = nextToken();
    getMyFilesMock.mockResolvedValue({
      items: [
        file('1', { roomName: 'general' }),
        file('2', { roomName: 'random' }),
      ],
      total: 2,
      limit: 50,
      offset: 0,
    });

    const { result } = renderHook(() => useMyFiles({ roomName: 'general' }), {
      wrapper: makeWrapper(token),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]._id).toBe('1');
  });

  it('reuses the cached page for the same token without refetching', async () => {
    const token = nextToken();
    getMyFilesMock.mockResolvedValue({
      items: [file('1')],
      total: 1,
      limit: 50,
      offset: 0,
    });

    const wrapper = makeWrapper(token);
    const first = renderHook(() => useMyFiles(), { wrapper });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    getMyFilesMock.mockClear();

    const second = renderHook(() => useMyFiles(), { wrapper });
    // Cache hydrates synchronously - no loading flash, no second fetch.
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.items).toHaveLength(1);
    expect(getMyFilesMock).not.toHaveBeenCalled();
  });

  it('refresh() bypasses the cache and refetches from offset 0', async () => {
    const token = nextToken();
    getMyFilesMock.mockResolvedValue({
      items: [file('1')],
      total: 1,
      limit: 50,
      offset: 0,
    });

    const { result } = renderHook(() => useMyFiles(), {
      wrapper: makeWrapper(token),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    getMyFilesMock.mockClear();
    getMyFilesMock.mockResolvedValue({
      items: [file('9')],
      total: 1,
      limit: 50,
      offset: 0,
    });

    act(() => {
      result.current.refresh();
    });

    await waitFor(() =>
      expect(result.current.items.map((f) => f._id)).toEqual(['9'])
    );
    expect(getMyFilesMock).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0 })
    );
  });
});
