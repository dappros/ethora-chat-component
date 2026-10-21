import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';

const mounts = vi.hoisted(() => ({ mount: 0, unmount: 0 }));
vi.mock('../../networking/api-requests/auth.api', () => ({
  ensureUserFromMy: vi.fn(async (u: any) => u),
  loginEmail: vi.fn(),
  loginViaJwt: vi.fn(),
}));
vi.mock('../../networking/apiClient', () => ({
  setBaseURL: vi.fn(),
  default: { post: vi.fn(), get: vi.fn() },
}));
vi.mock('./ChatWrapper', async () => {
  const R = await import('react');
  return {
    ChatWrapper: () => {
      R.useEffect(() => {
        mounts.mount += 1;
        return () => {
          mounts.unmount += 1;
        };
      }, []);
      return R.createElement('div', { 'data-testid': 'chat-wrapper' });
    },
  };
});
vi.mock('../AuthForms/Login', () => ({ default: () => <div data-testid="login-form" /> }));

import LoginWrapper from './LoginWrapper';

const USER = { xmppUsername: 'appid_alice', xmppPassword: 'secret', token: 't', refreshToken: 'r' } as any;

describe('LoginWrapper - a restyled config on a signed-in chat', () => {
  it('does not log in again and does not remount the chat', async () => {
    const loginFunction = vi.fn(async () => USER);
    const config = (colors: any) =>
      ({ appId: 'appid', customLogin: { enabled: true, loginFunction }, colors }) as any;
    const { rerender, getByTestId } = renderWithProviders(
      <LoginWrapper config={config({ primary: '#111111' })} />,
      { preloadedState: { chatSettingStore: { user: USER, config: { appId: 'appid' } } as any } }
    );
    await waitFor(() => expect(getByTestId('chat-wrapper')).toBeTruthy());
    expect(mounts.mount).toBe(1);

    rerender(<LoginWrapper config={config({ primary: '#0052cd', inputBackground: '#fafafa' })} />);
    rerender(<LoginWrapper config={{ ...config({ primary: '#aa0000' }), colorScheme: 'dark', disableMedia: true }} />);
    await new Promise((r) => setTimeout(r, 30));

    expect(loginFunction).not.toHaveBeenCalled();
    expect(mounts.mount).toBe(1);
    expect(mounts.unmount).toBe(0);
  });
});
