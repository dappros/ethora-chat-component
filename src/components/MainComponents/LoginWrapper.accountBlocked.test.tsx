import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, waitFor } from '@testing-library/react';
import type { EnhancedStore } from '@reduxjs/toolkit';
import { renderWithProviders } from '../../test/renderWithProviders';

const getStoredUserMock = vi.fn();
const hasStoredSensitiveSessionMock = vi.fn();
const ensureUserFromMyMock = vi.fn();
const loginViaJwtMock = vi.fn();
const performLogoutMock = vi.fn();

vi.mock('../../helpers/authStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../helpers/authStorage')>()),
  getStoredUser: (...args: any[]) => getStoredUserMock(...args),
  hasStoredSensitiveSession: (...args: any[]) =>
    hasStoredSensitiveSessionMock(...args),
  persistUserSession: vi.fn(),
}));
vi.mock('../../networking/api-requests/auth.api', () => ({
  ensureUserFromMy: (...args: any[]) => ensureUserFromMyMock(...args),
  loginEmail: vi.fn(),
  loginViaJwt: (...args: any[]) => loginViaJwtMock(...args),
}));
vi.mock('../../networking/apiClient', () => ({
  setBaseURL: vi.fn(),
  default: { post: vi.fn(), get: vi.fn() },
}));
vi.mock('../../hooks/useLogout', () => ({
  logoutService: { performLogout: () => performLogoutMock() },
}));
vi.mock('./ChatWrapper', () => ({
  ChatWrapper: () => <div data-testid="chat-wrapper" />,
}));
vi.mock('../AuthForms/Login', () => ({
  default: () => <div data-testid="login-form" />,
}));

import LoginWrapper from './LoginWrapper';
import { AccountBlockedNoticeTestIds } from './AccountBlockedNotice';

const ALICE = {
  xmppUsername: 'appid_alice',
  xmppPassword: 'secret',
  token: 'tok',
  refreshToken: 'ref',
} as any;

const BLOCKED = {
  blocked: 'suspended',
  code: 'USER_SUSPENDED',
  userKey: 'appid_alice',
  suspension: {
    reasonCode: 'security',
    message: null,
    suspendedAt: null,
    until: null,
    supportContact: null,
  },
} as any;

const renderWrapper = (
  config: any,
  user: any = ALICE,
  storeRef?: { current: EnhancedStore | null }
) =>
  renderWithProviders(<LoginWrapper config={config} />, {
    preloadedState: {
      chatSettingStore: { user, config, accountStatus: BLOCKED } as any,
    },
    storeRef,
  });

describe('LoginWrapper - suspended or archived account', () => {
  beforeEach(() => {
    getStoredUserMock.mockReset().mockReturnValue(null);
    hasStoredSensitiveSessionMock.mockReset().mockReturnValue(false);
    ensureUserFromMyMock.mockReset().mockImplementation(async (u: any) => u);
    loginViaJwtMock.mockReset();
    performLogoutMock.mockReset();
  });

  it('renders the notice instead of the chat, even with a usable session', () => {
    const { getByTestId, queryByTestId } = renderWrapper({ appId: 'appid' });

    expect(getByTestId(AccountBlockedNoticeTestIds.screen)).toBeTruthy();
    expect(queryByTestId('chat-wrapper')).toBeNull();
    expect(queryByTestId('login-form')).toBeNull();
  });

  it('does not run any sign-in path while blocked', async () => {
    renderWrapper(
      { appId: 'appid', jwtLogin: { enabled: true, token: 'jwt' } },
      { ...ALICE, xmppPassword: '' }
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(loginViaJwtMock).not.toHaveBeenCalled();
    expect(ensureUserFromMyMock).not.toHaveBeenCalled();
  });

  it('offers sign-out for the built-in sign-in and runs the logout service', () => {
    const { getByTestId } = renderWrapper({ appId: 'appid' });

    fireEvent.click(getByTestId(AccountBlockedNoticeTestIds.signOutButton));
    expect(performLogoutMock).toHaveBeenCalledTimes(1);
  });

  it('leaves sign-out to a host that signs the user in', () => {
    const { queryByTestId } = renderWrapper({
      appId: 'appid',
      userLogin: { enabled: true, user: ALICE },
    });

    expect(queryByTestId(AccountBlockedNoticeTestIds.signOutButton)).toBeNull();
  });

  it('shows the chat again when the host hands over a different user', async () => {
    const storeRef: { current: EnhancedStore | null } = { current: null };
    const BOB = { ...ALICE, xmppUsername: 'appid_bob' };
    const { queryByTestId } = renderWrapper(
      { appId: 'appid', userLogin: { enabled: true, user: BOB } },
      ALICE,
      storeRef
    );

    await waitFor(() => expect(queryByTestId('chat-wrapper')).toBeTruthy());
    // Cleared by the setUser reducer, which saw a different account.
    expect((storeRef.current!.getState() as any).chatSettingStore.accountStatus).toBeNull();
  });
});
