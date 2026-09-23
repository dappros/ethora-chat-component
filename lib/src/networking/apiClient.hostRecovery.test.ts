/**
 * Bug D: apiClient's interceptor used to dispatch `logout()` unconditionally
 * whenever refreshAuthTokens() rejected with a fatal verdict (the Ethora
 * refresh token itself is dead - reuse detected, not found, or a stale
 * ALREADY_ROTATED with nothing newer around). `logout()` clears
 * xmppUsername/xmppPassword, which unmounts the whole chat UI
 * (LoginWrapper's render gate) and falls back to a loading/login screen -
 * even when the host embedding this SDK (config.customLogin /
 * config.jwtLogin) can hand back a perfectly valid, fresh session on
 * demand. These pin the new behaviour: try the host's own recovery first,
 * and only fall back to logout() when that also comes up empty.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// apiClient.ts calls axios.create(...) eagerly at module load, so the mock
// factory below runs before this file's own top-level statements do (see
// the ../roomStore mock's comment for the same reasoning) - vi.hoisted is
// what makes `httpMock` exist in time for that.
const { httpMock } = vi.hoisted(() => ({
  httpMock: Object.assign(vi.fn(), {
    post: vi.fn(),
    get: vi.fn(),
    defaults: { baseURL: '' },
    interceptors: { response: { use: vi.fn() } },
  }),
}));

vi.mock('axios', () => ({
  default: { create: vi.fn(() => httpMock) },
}));

// A real (minimal) store, same trick authRefresh.test.ts uses - apiClient.ts
// reads store.getState() eagerly at module load (to seed baseURL), so the
// mock can't be a closure over outer test-file variables (those are still in
// their temporal dead zone at that point). Everything the factory needs is
// built from scratch inside it instead.
vi.mock('../roomStore', async () => {
  const { configureStore } = await import('@reduxjs/toolkit');
  const chatSettingsReducer = (await import('../roomStore/chatSettingsSlice'))
    .default;
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsReducer },
  });
  return { __esModule: true, store };
});

const refreshAuthTokens = vi.fn();
const isRefreshFatalError = vi.fn();
const hasRotatableSession = vi.fn(() => true);
const markCurrentSessionDead = vi.fn();
const attemptHostRecovery = vi.fn();

vi.mock('./authRefresh', () => ({
  refreshAuthTokens: (...args: unknown[]) => refreshAuthTokens(...args),
  isRefreshFatalError: (...args: unknown[]) => isRefreshFatalError(...args),
  hasRotatableSession: () => hasRotatableSession(),
  markCurrentSessionDead: (...args: unknown[]) => markCurrentSessionDead(...args),
  attemptHostRecovery: (...args: unknown[]) => attemptHostRecovery(...args),
}));

import { store } from '../roomStore';
import { logout, setConfig, setUser } from '../roomStore/chatSettingsSlice';

// Imported for its side effect: registers the interceptor on httpMock.
import './apiClient';

const getErrorHandler = () => {
  const call = httpMock.interceptors.response.use.mock.calls[0];
  return call[1] as (error: unknown) => Promise<unknown>;
};

const fatalRefreshError = () =>
  Object.assign(new Error('dead'), { name: 'RefreshFatalError' });

const unauthorized401 = (url = '/v1/rooms') => ({
  config: { url, headers: {} },
  response: { status: 401, data: {} },
});

describe('apiClient interceptor - fatal refresh recovery (Bug D)', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    httpMock.mockReset();
    httpMock.post.mockReset();
    refreshAuthTokens.mockReset();
    isRefreshFatalError.mockReset();
    hasRotatableSession.mockReset().mockReturnValue(true);
    markCurrentSessionDead.mockReset();
    attemptHostRecovery.mockReset();

    store.dispatch(setConfig({ refreshTokens: { enabled: true } } as never));
    store.dispatch(setUser({ token: 'stale-token' } as never));
    dispatchSpy = vi.spyOn(store, 'dispatch');
  });

  it('retries the original request with a fresh token when host recovery succeeds, and does not log out', async () => {
    refreshAuthTokens.mockRejectedValue(fatalRefreshError());
    isRefreshFatalError.mockReturnValue(true);
    attemptHostRecovery.mockImplementation(async () => {
      // Mirrors what a real recovery does: dispatch a fresh session before
      // resolving, so the retry below picks up the new token.
      store.dispatch(setUser({ token: 'fresh-from-host' } as never));
      return true;
    });
    httpMock.mockResolvedValueOnce({ data: 'retried-ok' });

    const errorHandler = getErrorHandler();
    const result = await errorHandler(unauthorized401());

    expect(attemptHostRecovery).toHaveBeenCalledTimes(1);
    expect(markCurrentSessionDead).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).not.toHaveBeenCalledWith(logout());
    expect(httpMock).toHaveBeenCalledTimes(1);
    expect(httpMock.mock.calls[0][0].headers['Authorization']).toBe(
      'fresh-from-host'
    );
    expect(result).toEqual({ data: 'retried-ok' });
  });

  it('falls back to logout() when the host has no recovery mechanism configured', async () => {
    refreshAuthTokens.mockRejectedValue(fatalRefreshError());
    isRefreshFatalError.mockReturnValue(true);
    attemptHostRecovery.mockResolvedValue(false);

    const errorHandler = getErrorHandler();
    await expect(errorHandler(unauthorized401())).rejects.toBeTruthy();

    expect(attemptHostRecovery).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith(logout());
    // No original-request retry when recovery failed.
    expect(httpMock).not.toHaveBeenCalled();
  });

  it('falls back to logout() when host recovery succeeds but leaves no usable token', async () => {
    refreshAuthTokens.mockRejectedValue(fatalRefreshError());
    isRefreshFatalError.mockReturnValue(true);
    // Recovery reports success but (unrealistically) never actually set a
    // token - must not be trusted blindly.
    store.dispatch(setUser({ token: '' } as never));
    attemptHostRecovery.mockResolvedValue(true);

    const errorHandler = getErrorHandler();
    await expect(errorHandler(unauthorized401())).rejects.toBeTruthy();

    expect(dispatchSpy).toHaveBeenCalledWith(logout());
    expect(httpMock).not.toHaveBeenCalled();
  });

  it('never calls host recovery for a non-fatal refresh failure (network blip, in-progress race)', async () => {
    refreshAuthTokens.mockRejectedValue(new Error('Network Error'));
    isRefreshFatalError.mockReturnValue(false);

    const errorHandler = getErrorHandler();
    await expect(errorHandler(unauthorized401())).rejects.toBeTruthy();

    expect(attemptHostRecovery).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalledWith(logout());
  });

  it('never calls host recovery when the refresh itself succeeds (happy path unaffected)', async () => {
    refreshAuthTokens.mockResolvedValue({ token: 'rotated-token' });
    httpMock.mockResolvedValueOnce({ data: 'ok' });

    const errorHandler = getErrorHandler();
    const result = await errorHandler(unauthorized401());

    expect(attemptHostRecovery).not.toHaveBeenCalled();
    expect(result).toEqual({ data: 'ok' });
  });
});
