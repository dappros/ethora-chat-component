import { describe, expect, it, vi, beforeEach } from 'vitest';

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

import { getMyUser } from './user.api';

// Regression: getMyUser had no way to be cancelled - resolveInitBeforeLoadUser
// receives a bootstrap AbortSignal but couldn't forward it, so a superseded
// bootstrap kept the /users/my request alive regardless.
describe('getMyUser abort handling', () => {
  beforeEach(() => {
    httpGetMock.mockReset();
  });

  it('forwards the AbortSignal to axios', async () => {
    const controller = new AbortController();
    httpGetMock.mockResolvedValueOnce({ data: { user: { firstName: 'A' } } });

    await getMyUser({ token: 'tok-1', signal: controller.signal });

    expect(httpGetMock).toHaveBeenCalledWith(
      '/v1/users/my',
      expect.objectContaining({ signal: controller.signal })
    );
  });

  it('propagates a cancellation error to the caller', async () => {
    const controller = new AbortController();
    const canceledError = Object.assign(new Error('canceled'), {
      code: 'ERR_CANCELED',
    });
    httpGetMock.mockRejectedValueOnce(canceledError);

    await expect(
      getMyUser({ token: 'tok-1', signal: controller.signal })
    ).rejects.toBe(canceledError);
  });
});
