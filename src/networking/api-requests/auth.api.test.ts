import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  GoogleAuthProvider: vi.fn(() => ({ addScope: vi.fn() })),
  signInWithPopup: vi.fn(),
}));
vi.mock('../../firebase-config', () => ({ app: null }));

const httpPostMock = vi.fn();
vi.mock('../apiClient', () => ({
  default: { post: (...args: unknown[]) => httpPostMock(...args) },
  appToken: 'app-token',
}));

const getStateMock = vi.fn(() => ({ chatSettingStore: { user: {} } }));
vi.mock('../../roomStore', () => ({
  store: { getState: () => getStateMock() },
}));

const getMyUserMock = vi.fn();
vi.mock('./user.api', () => ({
  getMyUser: (...args: unknown[]) => getMyUserMock(...args),
}));

import { loginEmail, loginSocial, loginViaJwt, ensureUserFromMy } from './auth.api';

// /users/my is metadata-only enrichment (firstName, profileImage, ...) on
// top of a login response that already has everything chat actually needs
// (xmppUsername/xmppPassword). It used to fire unconditionally on every
// login - reliably 403ing for at least one real role/backend (same root
// cause as resolveInitBeforeLoadUser.ts's bootstrap paths, just a
// different call site) - producing a forbidden request on every single
// login with nothing to show for it.
describe('auth.api - /users/my enrichment is skipped once xmpp creds are already present', () => {
  beforeEach(() => {
    httpPostMock.mockReset();
    getMyUserMock.mockReset();
  });

  it('loginViaJwt skips /users/my when the exchanged user already has xmpp credentials', async () => {
    httpPostMock.mockResolvedValue({
      data: {
        user: { xmppUsername: 'alice', xmppPassword: 'secret' },
        token: 'tok',
        refreshToken: 'rt',
      },
    });

    const user = await loginViaJwt('client-jwt');

    expect(getMyUserMock).not.toHaveBeenCalled();
    expect(user.xmppUsername).toBe('alice');
  });

  it('loginViaJwt still hydrates via /users/my when xmpp credentials are missing', async () => {
    httpPostMock.mockResolvedValue({
      data: { user: {}, token: 'tok', refreshToken: 'rt' },
    });
    getMyUserMock.mockResolvedValue({
      xmppUsername: 'bob',
      xmppPassword: 'secret',
    });

    const user = await loginViaJwt('client-jwt');

    expect(getMyUserMock).toHaveBeenCalledWith({ token: 'tok' });
    expect(user.xmppUsername).toBe('bob');
  });

  it('loginEmail skips /users/my when the login response already has xmpp credentials', async () => {
    httpPostMock.mockResolvedValue({
      data: {
        user: { xmppUsername: 'alice', xmppPassword: 'secret' },
        token: 'tok',
        refreshToken: 'rt',
      },
    });

    const res = await loginEmail('alice@example.com', 'pw');

    expect(getMyUserMock).not.toHaveBeenCalled();
    expect(res.data.user.xmppUsername).toBe('alice');
  });

  it('loginSocial skips /users/my when the login response already has xmpp credentials', async () => {
    httpPostMock.mockResolvedValue({
      data: {
        user: { xmppUsername: 'alice', xmppPassword: 'secret' },
        token: 'tok',
      },
    });

    const res = await loginSocial('idTok', 'accessTok', 'google');

    expect(getMyUserMock).not.toHaveBeenCalled();
    expect(res.data.user.xmppUsername).toBe('alice');
  });

  it('ensureUserFromMy skips /users/my when the user already has xmpp credentials', async () => {
    const user = {
      xmppUsername: 'alice',
      xmppPassword: 'secret',
      token: 'tok',
    } as any;

    const result = await ensureUserFromMy(user);

    expect(getMyUserMock).not.toHaveBeenCalled();
    expect(result).toBe(user);
  });

  it('ensureUserFromMy still hydrates via /users/my when xmpp credentials are missing', async () => {
    const user = { token: 'tok' } as any;
    getMyUserMock.mockResolvedValue({
      xmppUsername: 'bob',
      xmppPassword: 'secret',
    });

    const result = await ensureUserFromMy(user);

    expect(getMyUserMock).toHaveBeenCalledWith({ token: 'tok' });
    expect(result?.xmppUsername).toBe('bob');
  });
});
