import { describe, expect, it, vi, beforeEach } from 'vitest';
import axios from 'axios';

const httpGetMock = vi.fn();
vi.mock('../apiClient', () => ({
  default: { get: (...args: unknown[]) => httpGetMock(...args) },
}));

const getStateMock = vi.fn(() => ({
  chatSettingStore: { user: { token: 'tok-1' } },
}));
vi.mock('../../roomStore', () => ({
  store: { getState: () => getStateMock() },
}));

import { getRooms, getRoomByName, invalidateRoomsCache } from './rooms.api';

// Regression: getRooms/getRoomByName did not accept an AbortSignal at all,
// so a caller (xmppProvider's bootstrap AbortController) had no way to
// cancel a superseded request. Now that they forward `signal` to axios, a
// canceled request must (a) actually propagate the cancellation to the
// caller and (b) never get written into getRooms' 60s success cache -
// otherwise a half-finished/aborted response would poison every later
// getRooms() call for up to 60s.
describe('rooms.api abort handling', () => {
  beforeEach(() => {
    httpGetMock.mockReset();
    invalidateRoomsCache();
  });

  it('forwards the AbortSignal to axios for getRooms', async () => {
    const controller = new AbortController();
    httpGetMock.mockResolvedValueOnce({ data: { items: [] } });

    await getRooms(controller.signal);

    expect(httpGetMock).toHaveBeenCalledWith(
      '/v1/chats/my',
      expect.objectContaining({ signal: controller.signal })
    );
  });

  it('propagates a CanceledError instead of caching a stale/empty result', async () => {
    const controller = new AbortController();
    const canceledError = new axios.CanceledError('canceled');
    httpGetMock.mockRejectedValueOnce(canceledError);

    await expect(getRooms(controller.signal)).rejects.toBe(canceledError);

    // The abort must not have poisoned the cache: the very next call has
    // to hit the network again instead of replaying nothing/an error.
    httpGetMock.mockResolvedValueOnce({ data: { items: [{ jid: 'room1' }] } });
    const result = await getRooms();
    expect(result.items).toHaveLength(1);
    expect(httpGetMock).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight entry on abort so a later call is not stuck', async () => {
    const controller = new AbortController();
    let rejectFirst: (err: unknown) => void = () => {};
    httpGetMock.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        })
    );

    const firstCall = getRooms(controller.signal);
    rejectFirst(new axios.CanceledError('canceled'));
    await expect(firstCall).rejects.toBeInstanceOf(axios.CanceledError);

    httpGetMock.mockResolvedValueOnce({ data: { items: [] } });
    // If the in-flight entry weren't cleared, this call would hang forever
    // awaiting the already-rejected first promise instead of firing anew.
    await expect(getRooms()).resolves.toEqual({ items: [] });
  });

  it('forwards the AbortSignal to axios for getRoomByName and propagates cancellation', async () => {
    const controller = new AbortController();
    const canceledError = new axios.CanceledError('canceled');
    httpGetMock.mockRejectedValueOnce(canceledError);

    await expect(getRoomByName('room1', controller.signal)).rejects.toBe(
      canceledError
    );
    expect(httpGetMock).toHaveBeenCalledWith(
      '/v1/chats/my/room1',
      expect.objectContaining({ signal: controller.signal })
    );
  });
});
