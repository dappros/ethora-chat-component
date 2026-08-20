import { describe, expect, it, vi, beforeEach } from 'vitest';

const getStateMock = vi.fn();
vi.mock('../roomStore', () => ({
  store: {
    getState: () => getStateMock(),
    dispatch: vi.fn(),
  },
}));

const getMyUserMock = vi.fn();
vi.mock('../networking/api-requests/user.api', () => ({
  getMyUser: (...args: unknown[]) => getMyUserMock(...args),
}));

const loginViaJwtMock = vi.fn();
vi.mock('../networking/api-requests/auth.api', () => ({
  loginViaJwt: (...args: unknown[]) => loginViaJwtMock(...args),
}));

const getStoredUserMock = vi.fn();
const hasStoredSensitiveSessionMock = vi.fn();
vi.mock('./authStorage', () => ({
  getStoredUser: (...args: unknown[]) => getStoredUserMock(...args),
  hasStoredSensitiveSession: (...args: unknown[]) =>
    hasStoredSensitiveSessionMock(...args),
}));

vi.mock('../networking/apiClient', () => ({
  default: { post: vi.fn(), get: vi.fn() },
  setBaseURL: vi.fn(),
}));

import { resolveInitBeforeLoadUser } from './resolveInitBeforeLoadUser';

const emptyUser = () => ({
  token: '',
  refreshToken: '',
  xmppUsername: '',
  xmppPassword: '',
});

// Removed per explicit request: the currentUser/storedUser fallbacks used
// to call /users/my (tryHydrateViaMy) on every bootstrap that reached
// them, whether or not the account's role even has the ACL for that
// endpoint - measured live against a real QA backend, it reliably 403s
// ("!reqUserAcl") for at least one real role. Neither fallback can ever
// be completed by that response anyway (only currentUser/storedUser
// itself supplies xmppUsername/xmppPassword here), so the request was
// pure overhead. The explicitUser path (a host deliberately opting into
// token-only login) is a real, kept use of /users/my - see the separate
// describe block below.
describe('resolveInitBeforeLoadUser - currentUser/storedUser fallbacks never call /users/my', () => {
  beforeEach(() => {
    getMyUserMock.mockReset();
    loginViaJwtMock.mockReset();
    getStoredUserMock.mockReset();
    hasStoredSensitiveSessionMock.mockReset();
    getStateMock.mockReset();
  });

  it('resolves currentUser directly when it already has xmpp credentials, without touching /users/my', async () => {
    getStateMock.mockReturnValue({
      chatSettingStore: {
        user: {
          ...emptyUser(),
          xmppUsername: 'alice',
          xmppPassword: 'secret',
          token: 'tok',
        },
      },
    });
    getStoredUserMock.mockReturnValue(null);

    const result = await resolveInitBeforeLoadUser({ config: {} as any });

    expect(result?.xmppUsername).toBe('alice');
    expect(getMyUserMock).not.toHaveBeenCalled();
  });

  it('returns null for a currentUser lacking xmpp credentials instead of hydrating via /users/my', async () => {
    getStateMock.mockReturnValue({
      chatSettingStore: { user: { ...emptyUser(), token: 'tok' } },
    });
    getStoredUserMock.mockReturnValue(null);

    const result = await resolveInitBeforeLoadUser({ config: {} as any });

    expect(result).toBeNull();
    expect(getMyUserMock).not.toHaveBeenCalled();
  });

  it('falls through to a storedUser that already has xmpp credentials, without touching /users/my', async () => {
    getStateMock.mockReturnValue({
      chatSettingStore: { user: emptyUser() },
    });
    getStoredUserMock.mockReturnValue({
      ...emptyUser(),
      xmppUsername: 'bob',
      xmppPassword: 'secret',
      token: 'tok',
    });
    hasStoredSensitiveSessionMock.mockReturnValue(true);

    const result = await resolveInitBeforeLoadUser({ config: {} as any });

    expect(result?.xmppUsername).toBe('bob');
    expect(getMyUserMock).not.toHaveBeenCalled();
  });

  it('returns null for a stored session lacking xmpp credentials instead of hydrating via /users/my', async () => {
    getStateMock.mockReturnValue({
      chatSettingStore: { user: emptyUser() },
    });
    getStoredUserMock.mockReturnValue({ ...emptyUser(), token: 'tok' });
    hasStoredSensitiveSessionMock.mockReturnValue(true);

    const result = await resolveInitBeforeLoadUser({ config: {} as any });

    expect(result).toBeNull();
    expect(getMyUserMock).not.toHaveBeenCalled();
  });
});

// The one place /users/my is still legitimately called: a host explicitly
// passing config.userLogin.user without direct xmpp credentials, relying
// on chat-component to derive them from the token.
describe('resolveInitBeforeLoadUser - explicitUser still hydrates via /users/my', () => {
  beforeEach(() => {
    getMyUserMock.mockReset();
    getStateMock.mockReturnValue({ chatSettingStore: { user: emptyUser() } });
  });

  it('calls /users/my when the host-provided user lacks xmpp credentials', async () => {
    getMyUserMock.mockResolvedValue({
      xmppUsername: 'from-my',
      xmppPassword: 'from-my-pass',
    });

    const result = await resolveInitBeforeLoadUser({
      config: {
        userLogin: {
          enabled: true,
          user: { token: 'tok', refreshToken: 'rt' } as any,
        },
      } as any,
    });

    expect(getMyUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'tok' })
    );
    expect(result?.xmppUsername).toBe('from-my');
  });

  it('skips /users/my when the host-provided user already has xmpp credentials', async () => {
    const result = await resolveInitBeforeLoadUser({
      config: {
        userLogin: {
          enabled: true,
          user: {
            xmppUsername: 'direct',
            xmppPassword: 'direct-pass',
          } as any,
        },
      } as any,
    });

    expect(getMyUserMock).not.toHaveBeenCalled();
    expect(result?.xmppUsername).toBe('direct');
  });
});

// ---- rotation durability -------------------------------------------

import http from '../networking/apiClient';
import { store } from '../roomStore';
import { __resetAuthRefreshStateForTests } from '../networking/authRefresh';

describe('bootstrap rotation is never dropped', () => {
  beforeEach(() => {
    getMyUserMock.mockReset();
    getStoredUserMock.mockReset();
    getStateMock.mockReset();
    (http.post as ReturnType<typeof vi.fn>).mockReset();
    (store.dispatch as ReturnType<typeof vi.fn>).mockReset();
    __resetAuthRefreshStateForTests();
  });

  it('persists the rotated refreshToken even when /users/my fails afterwards', async () => {
    // The regression this guards: the bootstrap path used to hold the
    // rotated token in a local variable and only write it on the happy
    // path, so a /users/my failure right after the refresh silently
    // discarded it. The next load would then present an already-burned
    // token - which the backend reads as reuse.
    getStateMock.mockReturnValue({
      chatSettingStore: { user: emptyUser(), config: {} },
    });
    getMyUserMock
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockRejectedValueOnce({ response: { status: 401 } });
    (http.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { token: 'access-2', refreshToken: 'refresh-2' },
    });

    await resolveInitBeforeLoadUser({
      config: {
        userLogin: {
          enabled: true,
          user: {
            ...emptyUser(),
            token: 'stale-access',
            refreshToken: 'refresh-1',
          },
        },
      } as never,
    });

    expect(http.post).toHaveBeenCalledWith(
      '/v1/users/login/refresh',
      {},
      { headers: { Authorization: 'refresh-1' } }
    );
    const persisted = (store.dispatch as ReturnType<typeof vi.fn>).mock.calls
      .map(([action]) => action)
      .filter((action) => action?.payload?.refreshToken === 'refresh-2');
    expect(persisted.length).toBeGreaterThan(0);
  });
});
