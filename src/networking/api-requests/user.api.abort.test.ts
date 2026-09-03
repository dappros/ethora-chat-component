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

import { getMyUser, invalidateMyUserCache } from './user.api';

// Regression: getMyUser had no way to be cancelled - resolveInitBeforeLoadUser
// receives a bootstrap AbortSignal but couldn't forward it, so a superseded
// bootstrap kept the /users/my request alive regardless.
describe('getMyUser abort handling', () => {
  beforeEach(() => {
    httpGetMock.mockReset();
    // getMyUser keeps a 10s per-token cache; a previous test's success
    // would otherwise short-circuit the request under test.
    invalidateMyUserCache();
  });

  it('forwards the AbortSignal to axios', async () => {
    const controller = new AbortController();
    httpGetMock.mockResolvedValueOnce({ data: { user: { firstName: 'A' } } });

    await getMyUser({ token: 'tok-1', signal: controller.signal });

    // The request runs on a shared internal signal (see sharedRequest.ts)
    // so several callers can piggyback on one GET; the caller's own signal
    // only detaches that caller.
    expect(httpGetMock).toHaveBeenCalledWith(
      '/v1/users/my',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('aborts the underlying request once its only subscriber aborts', async () => {
    const controller = new AbortController();
    let forwardedSignal: AbortSignal | undefined;
    httpGetMock.mockImplementationOnce((_url: string, config: { signal?: AbortSignal }) => {
      forwardedSignal = config.signal;
      // Behave like axios: reject with CanceledError once the signal fires,
      // which is what lets the in-flight entry clear itself.
      return new Promise((_, reject) => {
        config.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' }))
        );
      });
    });

    const pending = getMyUser({ token: 'tok-1', signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'CanceledError' });
    expect(forwardedSignal?.aborted).toBe(true);
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
    void controller;
  });
});
