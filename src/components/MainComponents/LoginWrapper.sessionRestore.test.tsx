import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';

const getStoredUserMock = vi.fn();
const hasStoredSensitiveSessionMock = vi.fn();
const ensureUserFromMyMock = vi.fn();

// Partial mock: chatSettingsSlice's setUser reducer also imports
// persistUserSession/clearStoredUser from here, so a bare object mock
// breaks the reducer (and leaks an unhandled rejection into this suite).
vi.mock('../../helpers/authStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../helpers/authStorage')>()),
  getStoredUser: (...args: any[]) => getStoredUserMock(...args),
  hasStoredSensitiveSession: (...args: any[]) => hasStoredSensitiveSessionMock(...args),
  persistUserSession: vi.fn(),
}));
vi.mock('../../networking/api-requests/auth.api', () => ({
  ensureUserFromMy: (...args: any[]) => ensureUserFromMyMock(...args),
  loginEmail: vi.fn(),
  loginViaJwt: vi.fn(),
}));
vi.mock('../../networking/apiClient', () => ({
  setBaseURL: vi.fn(),
  default: { post: vi.fn(), get: vi.fn() },
}));
// ChatWrapper drags in the whole XMPP stack; this suite is only about
// whether LoginWrapper restores the session, not what it renders after.
vi.mock('./ChatWrapper', () => ({
  ChatWrapper: () => <div data-testid="chat-wrapper" />,
}));
vi.mock('../AuthForms/Login', () => ({
  default: () => <div data-testid="login-form" />,
}));

import LoginWrapper from './LoginWrapper';

const STORED_SESSION = {
  xmppUsername: 'appid_alice',
  xmppPassword: 'secret',
  token: 'tok',
  refreshToken: 'ref',
} as any;

// The user as it comes back from redux-persist AFTER rehydrate:
// scrubSensitiveChatStateTransform (roomStore/index.ts) deliberately
// strips token/xmppPassword before writing to localStorage, so the
// rehydrated user is a husk - real xmppUsername, EMPTY xmppPassword.
const REHYDRATED_HUSK = {
  xmppUsername: 'appid_alice',
  xmppPassword: '',
  token: '',
  refreshToken: '',
} as any;

const renderWrapper = (user: any) =>
  renderWithProviders(<LoginWrapper config={{ appId: 'appid' } as any} />, {
    preloadedState: {
      chatSettingStore: { user, config: { appId: 'appid' } } as any,
    },
  });

// Regression: every page refresh showed the login form even though the
// stored session (@ethora/chat-component-user-session) was perfectly
// intact. LoginWrapper's initUser() short-circuited on
// `user.xmppUsername && ...` - which is TRUE for the rehydrated husk
// above - so it returned before ever calling getStoredUser(), and the
// render gate then fell through to <LoginForm> because xmppPassword ===
// ''. Verified live: with the real post-rehydrate state, the old guard
// short-circuits and the new one does not.
describe('LoginWrapper - session restore after refresh', () => {
  beforeEach(() => {
    getStoredUserMock.mockReset().mockReturnValue(STORED_SESSION);
    hasStoredSensitiveSessionMock.mockReset().mockReturnValue(true);
    ensureUserFromMyMock.mockReset().mockResolvedValue(STORED_SESSION);
  });

  it('restores the stored session when redux only holds a scrubbed husk (the refresh case)', async () => {
    renderWrapper(REHYDRATED_HUSK);

    await waitFor(() => expect(getStoredUserMock).toHaveBeenCalled());
    expect(ensureUserFromMyMock).toHaveBeenCalledWith(STORED_SESSION);
  });

  it('does NOT re-restore when redux already holds a usable session', async () => {
    renderWrapper(STORED_SESSION);

    // Give the effect a chance to run before asserting the negative.
    await waitFor(() => expect(true).toBe(true));
    expect(getStoredUserMock).not.toHaveBeenCalled();
  });

  it('still refuses to short-circuit for a DIFFERENT user than config asks for (multi-tenant guard)', async () => {
    // The App Switcher case the original guard existed for: redux holds a
    // usable session, but config wants someone else - must not short-circuit.
    renderWithProviders(
      <LoginWrapper
        config={{
          appId: 'appid',
          userLogin: { enabled: true, user: { xmppUsername: 'appid_bob' } },
        } as any}
      />,
      {
        preloadedState: {
          chatSettingStore: {
            user: STORED_SESSION,
            config: { appId: 'appid' },
          } as any,
        },
      }
    );

    await waitFor(() => expect(ensureUserFromMyMock).toHaveBeenCalled());
  });
});
