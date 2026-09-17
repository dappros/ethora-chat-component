import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// A failed /chats/my must never look like "this account has no chats".
// getRooms() swallows transport errors and returns an empty list, which is
// what let a 401 during a first login (token still propagating) latch
// "rooms resolved cleanly, zero rooms" and paint the
// "No room. Let's create one!" CTA before the real rooms arrived.
const getRooms = vi.fn();
const invalidateRoomsCache = vi.fn();

vi.mock('../networking/api-requests/rooms.api', () => ({
  getRooms: (...args: unknown[]) => getRooms(...args),
  invalidateRoomsCache: () => invalidateRoomsCache(),
}));

vi.mock('../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null }),
}));

const dispatch = vi.fn();
vi.mock('./hooks', () => ({
  useAppDispatch: () => dispatch,
}));

vi.mock('../helpers/createRoomFromApi', () => ({
  createRoomFromApi: (room: unknown) => room,
}));

import useGetNewArchRoom from './useGetNewArchRoom';

describe('useGetNewArchRoom', () => {
  beforeEach(() => {
    getRooms.mockReset();
    dispatch.mockReset();
  });

  it('rejects when the rooms fetch failed instead of reporting an empty list', async () => {
    getRooms.mockResolvedValue({ items: [], failed: true });
    const { result } = renderHook(() => useGetNewArchRoom());

    await expect(result.current({}, {})).rejects.toThrow(/failed to load rooms/i);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('still resolves with an empty list when the account genuinely has no chats', async () => {
    getRooms.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useGetNewArchRoom());

    await expect(result.current({}, {})).resolves.toEqual([]);
  });
});
