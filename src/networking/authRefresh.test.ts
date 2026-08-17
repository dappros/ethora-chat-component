/**
 * authRefresh — the single rotation point (phase 1).
 *
 * The backend rotates refresh tokens and treats a re-presented token as
 * theft, so the behaviours pinned here are correctness-critical:
 *   - concurrent callers in one tab share ONE request
 *   - concurrent TABS are serialised by the Web Lock, and the waiter
 *     re-reads localStorage instead of rotating with its stale copy
 *   - the rotated token is persisted before the promise resolves
 *   - REFRESH_IN_PROGRESS retries instead of logging out
 *   - ALREADY_ROTATED adopts a newer stored token, else goes fatal
 *   - REUSE_DETECTED / NOT_FOUND are fatal
 *   - network errors are NOT fatal and leave the tokens alone
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// The jsdom build used here exposes `localStorage` as a bare object with
// no Storage methods, and cross-tab persistence is the whole point of
// this module — so install a real in-memory Storage before anything
// touches `authStorage`.
const createStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
  } as Storage;
};

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: createStorage(),
});
Object.defineProperty(window, 'sessionStorage', {
  configurable: true,
  value: createStorage(),
});

const post = vi.fn();

vi.mock('./apiClient', () => ({
  __esModule: true,
  default: { post: (...args: unknown[]) => post(...args) },
}));

vi.mock('../roomStore', async () => {
  const { configureStore } = await import('@reduxjs/toolkit');
  const chatSettingsReducer = (await import('../roomStore/chatSettingsSlice'))
    .default;
  const store = configureStore({
    reducer: { chatSettingStore: chatSettingsReducer },
  });
  return { __esModule: true, store };
});

import { store } from '../roomStore';
import { setUser, setConfig } from '../roomStore/chatSettingsSlice';
import { clearStoredUser, persistUserSession } from '../helpers/authStorage';
import {
  refreshAuthTokens,
  refreshAuthTokensQuietly,
  parseRefreshErrorCode,
  isRefreshFatalError,
  __resetAuthRefreshStateForTests,
} from './authRefresh';

const unauthorized = (code?: string) => ({
  response: { status: 401, data: code ? { code } : {}, headers: {} },
});

const seedUser = (refreshToken: string, token = 'access-old') => {
  store.dispatch(
    setUser({
      _id: 'u1',
      token,
      refreshToken,
      xmppPassword: 'pw',
      xmppUsername: 'user',
    } as never)
  );
};

/** Writes tokens straight to localStorage, as another tab would. */
const otherTabRotatedTo = (token: string, refreshToken: string) => {
  persistUserSession({
    ...store.getState().chatSettingStore.user,
    token,
    refreshToken,
  });
};

beforeEach(() => {
  __resetAuthRefreshStateForTests();
  // reset, not clear: some cases install a persistent mockImplementation
  // that would otherwise leak into the next test.
  post.mockReset();
  vi.clearAllMocks();
  localStorage.clear();
  clearStoredUser();
  store.dispatch(setConfig({ refreshTokens: { enabled: true } } as never));
  seedUser('refresh-1');
});

afterEach(() => {
  // The lock manager is installed per-test via defineProperty; drop it
  // so the "no Web Locks" fallback case sees a clean navigator.
  Reflect.deleteProperty(navigator, 'locks');
});

describe('happy path', () => {
  it('rotates, persists the new refreshToken, and resolves', async () => {
    post.mockResolvedValueOnce({
      data: { token: 'access-2', refreshToken: 'refresh-2' },
    });

    const result = await refreshAuthTokens();

    expect(result.refreshToken).toBe('refresh-2');
    expect(store.getState().chatSettingStore.user.refreshToken).toBe(
      'refresh-2'
    );
    // Visible to the other tabs — that is what makes the lock useful.
    expect(localStorage.getItem('@ethora/chat-component-user-session')).toContain(
      'refresh-2'
    );
  });

  it('sends the refresh token as the Authorization header', async () => {
    post.mockResolvedValueOnce({
      data: { token: 'access-2', refreshToken: 'refresh-2' },
    });

    await refreshAuthTokens();

    expect(post).toHaveBeenCalledWith(
      '/v1/users/login/refresh',
      {},
      { headers: { Authorization: 'refresh-1' } }
    );
  });

  it('prefers the localStorage token over the stale in-memory copy', async () => {
    // Simulates the classic bug: this tab's redux copy was hydrated at
    // load and never updated, while another tab has since rotated.
    otherTabRotatedTo('access-newer', 'refresh-newer');
    post.mockResolvedValueOnce({
      data: { token: 'access-3', refreshToken: 'refresh-3' },
    });

    await refreshAuthTokens();

    expect(post.mock.calls[0][2]).toEqual({
      headers: { Authorization: 'refresh-newer' },
    });
  });

  it('rejects a response that is missing either token', async () => {
    post.mockResolvedValueOnce({ data: { token: 'access-2' } });

    await expect(refreshAuthTokens()).rejects.toThrow(
      /did not contain both tokens/
    );
  });
});

describe('concurrency', () => {
  it('collapses concurrent callers into a single request', async () => {
    let resolvePost: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolvePost = resolve;
    });
    post.mockReturnValueOnce(pending);

    const calls = [
      refreshAuthTokens(),
      refreshAuthTokens(),
      refreshAuthTokens(),
      refreshAuthTokens(),
      refreshAuthTokens(),
    ];

    resolvePost({ data: { token: 'access-2', refreshToken: 'refresh-2' } });
    const results = await Promise.all(calls);

    expect(post).toHaveBeenCalledTimes(1);
    results.forEach((r) => expect(r.refreshToken).toBe('refresh-2'));
  });

  it('starts a fresh request once the in-flight one has settled', async () => {
    post
      .mockResolvedValueOnce({
        data: { token: 'access-2', refreshToken: 'refresh-2' },
      })
      .mockResolvedValueOnce({
        data: { token: 'access-3', refreshToken: 'refresh-3' },
      });

    await refreshAuthTokens();
    const second = await refreshAuthTokens();

    expect(post).toHaveBeenCalledTimes(2);
    expect(second.refreshToken).toBe('refresh-3');
    expect(post.mock.calls[1][2]).toEqual({
      headers: { Authorization: 'refresh-2' },
    });
  });
});

describe('web locks', () => {
  /** Minimal serialising LockManager stand-in — jsdom ships none. */
  const installLockManager = () => {
    let chain: Promise<unknown> = Promise.resolve();
    const request = vi.fn(<T,>(_name: string, callback: () => Promise<T>) => {
      const run = chain.then(() => callback());
      chain = run.catch(() => undefined);
      return run;
    });
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request },
    });
    return request;
  };

  it('runs the rotation inside the lock', async () => {
    const request = installLockManager();
    post.mockResolvedValueOnce({
      data: { token: 'access-2', refreshToken: 'refresh-2' },
    });

    await refreshAuthTokens();

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('ethora-auth-refresh');
  });

  it('a waiter that finds a newer token adopts it instead of rotating', async () => {
    installLockManager();
    // The lock is held by "another tab" which rotates and writes the
    // result to localStorage before releasing.
    let releaseWinner: (value: unknown) => void = () => {};
    const winnerPost = new Promise((resolve) => {
      releaseWinner = resolve;
    });
    post.mockReturnValueOnce(winnerPost);

    const winner = refreshAuthTokens();

    // Second tab: its own module state, so reset the in-flight promise
    // to model a genuinely separate caller queuing on the lock.
    __resetAuthRefreshStateForTests();
    const waiter = refreshAuthTokens();

    releaseWinner({ data: { token: 'access-2', refreshToken: 'refresh-2' } });

    await winner;
    const waiterResult = await waiter;

    // The waiter must NOT have rotated with 'refresh-1' — that is the
    // exact request the backend would read as token reuse.
    expect(post).toHaveBeenCalledTimes(1);
    expect(waiterResult.refreshToken).toBe('refresh-2');
  });

  it('falls back to the in-flight promise when Web Locks are unavailable', async () => {
    expect((navigator as Navigator & { locks?: unknown }).locks).toBeUndefined();
    post.mockResolvedValueOnce({
      data: { token: 'access-2', refreshToken: 'refresh-2' },
    });

    await expect(refreshAuthTokens()).resolves.toMatchObject({
      refreshToken: 'refresh-2',
    });
  });
});

describe('error codes', () => {
  it('REFRESH_IN_PROGRESS: retries and succeeds without logging out', async () => {
    post
      .mockRejectedValueOnce(unauthorized('REFRESH_IN_PROGRESS'))
      .mockRejectedValueOnce(unauthorized('REFRESH_IN_PROGRESS'))
      .mockResolvedValueOnce({
        data: { token: 'access-2', refreshToken: 'refresh-2' },
      });

    const result = await refreshAuthTokens();

    expect(post).toHaveBeenCalledTimes(3);
    expect(result.refreshToken).toBe('refresh-2');
  });

  it('REFRESH_IN_PROGRESS: exhausting the budget is not fatal', async () => {
    post.mockRejectedValue(unauthorized('REFRESH_IN_PROGRESS'));

    const error = await refreshAuthTokens().catch((e) => e);

    expect(post).toHaveBeenCalledTimes(3);
    expect(isRefreshFatalError(error)).toBe(false);
    expect(store.getState().chatSettingStore.user.refreshToken).toBe(
      'refresh-1'
    );
  });

  it('REFRESH_IN_PROGRESS: adopts a newer token if the winner wrote one', async () => {
    // The lock holder only lands its rotation after our retry budget is
    // spent — the case where giving up would otherwise mean an error
    // even though a perfectly good token is now sitting in storage.
    let attempts = 0;
    post.mockImplementation(() => {
      attempts += 1;
      if (attempts === 3) {
        otherTabRotatedTo('access-winner', 'refresh-winner');
      }
      return Promise.reject(unauthorized('REFRESH_IN_PROGRESS'));
    });

    const result = await refreshAuthTokens();

    expect(attempts).toBe(3);
    expect(result.refreshToken).toBe('refresh-winner');
  });

  it('ALREADY_ROTATED: adopts a newer token from storage', async () => {
    post.mockImplementationOnce(() => {
      otherTabRotatedTo('access-newer', 'refresh-newer');
      return Promise.reject(unauthorized('REFRESH_TOKEN_ALREADY_ROTATED'));
    });

    const result = await refreshAuthTokens();

    expect(result.refreshToken).toBe('refresh-newer');
    expect(store.getState().chatSettingStore.user.refreshToken).toBe(
      'refresh-newer'
    );
  });

  it('ALREADY_ROTATED: fatal when storage holds no newer token', async () => {
    post.mockRejectedValueOnce(
      unauthorized('REFRESH_TOKEN_ALREADY_ROTATED')
    );

    const error = await refreshAuthTokens().catch((e) => e);

    expect(isRefreshFatalError(error)).toBe(true);
    expect(error.code).toBe('REFRESH_TOKEN_ALREADY_ROTATED');
  });

  it('REUSE_DETECTED is fatal', async () => {
    post.mockRejectedValueOnce(unauthorized('REFRESH_TOKEN_REUSE_DETECTED'));

    const error = await refreshAuthTokens().catch((e) => e);

    expect(isRefreshFatalError(error)).toBe(true);
    expect(error.code).toBe('REFRESH_TOKEN_REUSE_DETECTED');
  });

  it('NOT_FOUND is fatal', async () => {
    post.mockRejectedValueOnce(unauthorized('REFRESH_TOKEN_NOT_FOUND'));

    expect(isRefreshFatalError(await refreshAuthTokens().catch((e) => e))).toBe(
      true
    );
  });

  it('network failure is not fatal and leaves the tokens intact', async () => {
    post.mockRejectedValueOnce(new Error('Network Error'));

    const error = await refreshAuthTokens().catch((e) => e);

    expect(isRefreshFatalError(error)).toBe(false);
    expect(store.getState().chatSettingStore.user.refreshToken).toBe(
      'refresh-1'
    );
  });

  it('a bare 401 without a code is not fatal', async () => {
    post.mockRejectedValueOnce(unauthorized());

    expect(isRefreshFatalError(await refreshAuthTokens().catch((e) => e))).toBe(
      false
    );
  });
});

describe('parseRefreshErrorCode', () => {
  it.each([
    ['data.code', { data: { code: 'REFRESH_IN_PROGRESS' } }],
    ['data.error.code', { data: { error: { code: 'REFRESH_TOKEN_REUSE_DETECTED' } } }],
    ['data.errors[0].code', { data: { errors: [{ code: 'REFRESH_TOKEN_NOT_FOUND' }] } }],
    ['data.message', { data: { message: 'REFRESH_TOKEN_ALREADY_ROTATED' } }],
  ])('reads the code from %s', (_label, response) => {
    expect(parseRefreshErrorCode({ response })).toBeTruthy();
  });

  it('returns null for a non-http error', () => {
    expect(parseRefreshErrorCode(new Error('boom'))).toBeNull();
  });
});

describe('missing token', () => {
  it('rejects without going fatal when there is nothing to rotate', async () => {
    seedUser('');
    clearStoredUser();

    const error = await refreshAuthTokens().catch((e) => e);

    expect(isRefreshFatalError(error)).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('consumer refreshFunction', () => {
  it('is used instead of the built-in endpoint, and is deduped', async () => {
    const refreshFunction = vi.fn().mockResolvedValue({
      accessToken: 'host-access',
      refreshToken: 'host-refresh',
    });
    store.dispatch(
      setConfig({ refreshTokens: { enabled: true, refreshFunction } } as never)
    );

    const [a, b] = await Promise.all([
      refreshAuthTokens(),
      refreshAuthTokens(),
    ]);

    expect(refreshFunction).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
    expect(a.refreshToken).toBe('host-refresh');
    expect(b.refreshToken).toBe('host-refresh');
    expect(store.getState().chatSettingStore.user.token).toBe('host-access');
  });

  it('keeps the existing refreshToken when the host omits one', async () => {
    const refreshFunction = vi
      .fn()
      .mockResolvedValue({ accessToken: 'host-access' });
    store.dispatch(
      setConfig({ refreshTokens: { enabled: true, refreshFunction } } as never)
    );

    const result = await refreshAuthTokens();

    expect(result.refreshToken).toBe('refresh-1');
  });
});

describe('refreshAuthTokensQuietly', () => {
  it('swallows failures and returns null', async () => {
    post.mockRejectedValueOnce(unauthorized('REFRESH_TOKEN_REUSE_DETECTED'));

    await expect(refreshAuthTokensQuietly()).resolves.toBeNull();
  });
});
