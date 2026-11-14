/**
 * Suspended / archived accounts through the http client: a USER_SUSPENDED or
 * USER_ARCHIVED answer is recorded once, is never answered with a token
 * refresh or a logout, and from then on every request except a new sign-in
 * is refused locally instead of reaching the server.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { httpMock } = vi.hoisted(() => ({
  httpMock: Object.assign(vi.fn(), {
    post: vi.fn(),
    get: vi.fn(),
    defaults: { baseURL: '' },
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  }),
}));

vi.mock('axios', () => ({
  default: { create: vi.fn(() => httpMock) },
}));

vi.mock('../roomStore', async () => {
  const { configureStore } = await import('@reduxjs/toolkit');
  const chatSettingsReducer = (await import('../roomStore/chatSettingsSlice'))
    .default;
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsReducer },
    middleware: (getDefault) =>
      getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  return { __esModule: true, store };
});

vi.mock('../helpers/authStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../helpers/authStorage')>()),
  persistUserSession: vi.fn(),
  clearStoredUser: vi.fn(),
}));

const refreshAuthTokens = vi.fn();
vi.mock('./authRefresh', () => ({
  refreshAuthTokens: (...args: unknown[]) => refreshAuthTokens(...args),
  isRefreshFatalError: () => false,
  hasRotatableSession: () => true,
  markCurrentSessionDead: vi.fn(),
  attemptHostRecovery: vi.fn(),
}));

import { store } from '../roomStore';
import {
  clearAccountBlocked,
  setConfig,
  setUser,
} from '../roomStore/chatSettingsSlice';
import {
  isAccountBlocked,
  isAccountBlockedError,
  isSessionStartRequest,
  reportAccountBlockedError,
} from './accountBlockedGate';
import './apiClient';

const requestHandler = () =>
  httpMock.interceptors.request.use.mock.calls[0][0] as (
    config: any
  ) => any;
const responseHandlers = () => {
  const call = httpMock.interceptors.response.use.mock.calls[0];
  return {
    onFulfilled: call[0] as (response: any) => any,
    onRejected: call[1] as (error: unknown) => Promise<unknown>,
  };
};

const suspended403 = (url = '/v1/chats/my') => ({
  config: { url, headers: {} },
  response: {
    status: 403,
    data: {
      code: 'USER_SUSPENDED',
      error: 'This account has been suspended.',
      details: {
        suspension: {
          reasonCode: 'security',
          message: null,
          suspendedAt: '2026-11-01T10:00:00.000Z',
          until: null,
          supportContact: null,
        },
      },
    },
  },
});

describe('apiClient and suspended or archived accounts', () => {
  beforeEach(() => {
    refreshAuthTokens.mockReset();
    store.dispatch(clearAccountBlocked());
    store.dispatch(
      setConfig({ refreshTokens: { enabled: true } } as any)
    );
    store.dispatch(
      setUser({ xmppUsername: 'app_alice', xmppPassword: 'pw', token: 't' } as any)
    );
  });

  it('records the block and rejects without refreshing or logging out', async () => {
    const error = suspended403();
    await expect(responseHandlers().onRejected(error)).rejects.toBe(error);

    expect(isAccountBlocked()).toBe(true);
    expect(store.getState().chatSettingStore.accountStatus).toMatchObject({
      blocked: 'suspended',
      code: 'USER_SUSPENDED',
      userKey: 'app_alice',
      suspension: { reasonCode: 'security' },
    });
    expect(refreshAuthTokens).not.toHaveBeenCalled();
    // Not a logout: the user stays in the store.
    expect(store.getState().chatSettingStore.user.xmppUsername).toBe('app_alice');
  });

  it('dispatches only when the block changes', () => {
    const spy = vi.spyOn(store, 'dispatch');
    reportAccountBlockedError(suspended403());
    reportAccountBlockedError(suspended403('/v1/users/my'));
    reportAccountBlockedError(suspended403('/v1/users/xmpp-token'));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('refuses later requests locally with the same 403 shape', async () => {
    reportAccountBlockedError(suspended403());

    const result = requestHandler()({ url: '/v1/chats/my', headers: {} });
    await expect(result).rejects.toSatisfy((error: any) => {
      return (
        isAccountBlockedError(error) &&
        error.response.status === 403 &&
        error.response.data.code === 'USER_SUSPENDED'
      );
    });

    // Token refresh is refused too.
    await expect(
      requestHandler()({ url: '/v1/users/login/refresh', headers: {} })
    ).rejects.toBeTruthy();
  });

  it('still lets a new sign-in through, and a successful one lifts the block', () => {
    reportAccountBlockedError(suspended403());

    const config = { url: '/v1/users/login-with-email', headers: {} };
    expect(requestHandler()(config)).toBe(config);

    responseHandlers().onFulfilled({ config, data: {}, status: 200 });
    expect(isAccountBlocked()).toBe(false);
  });

  it('sends requests normally while nothing is blocked', () => {
    const config = { url: '/v1/chats/my', headers: {} };
    expect(requestHandler()(config)).toBe(config);
  });

  it('still refreshes on a plain 401', async () => {
    refreshAuthTokens.mockResolvedValue({ token: 'new', refreshToken: 'r2' });
    httpMock.mockResolvedValueOnce({ data: 'retried' });
    const error = {
      config: { url: '/v1/chats/my', headers: {} },
      response: { status: 401, data: {} },
    };
    await expect(responseHandlers().onRejected(error)).resolves.toEqual({
      data: 'retried',
    });
    expect(refreshAuthTokens).toHaveBeenCalledTimes(1);
    expect(isAccountBlocked()).toBe(false);
  });
});

describe('isSessionStartRequest', () => {
  it.each([
    '/v1/users/login-with-email',
    '/v1/users/login',
    '/v1/users/client',
    '/v2/users/login-with-email',
    'https://api.example.com/v1/users/login?x=1',
  ])('treats %s as a sign-in', (url) => {
    expect(isSessionStartRequest(url)).toBe(true);
  });

  it.each([
    '/v1/users/login/refresh',
    '/v1/users/my',
    '/v1/users/xmpp-token',
    '/v1/chats/my',
    undefined,
  ])('does not treat %s as a sign-in', (url) => {
    expect(isSessionStartRequest(url)).toBe(false);
  });
});
