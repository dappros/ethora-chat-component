import React from 'react';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

// Mock the network surface BEFORE importing Login so the component
// picks up our stubs at import time. axios.create() in apiClient.ts
// reads from the redux store at module-load — we don't want a real
// HTTP request firing during a test.
vi.mock('../../networking/api-requests/auth.api', () => ({
  loginEmail: vi.fn(),
  ensureUserFromMy: vi.fn(),
  loginViaJwt: vi.fn(),
  loginSocial: vi.fn(),
  checkEmailExist: vi.fn().mockResolvedValue({ data: { success: false } }),
}));

// Toast provider's own showToast is fine — we just don't want
// it routing toast actions through redux-saga in tests.
import Login from './Login';
import { renderWithProviders } from '../../test/renderWithProviders';
import * as authApi from '../../networking/api-requests/auth.api';
import { AuthTestIds } from '../../testIds';

const loginEmailMock = vi.mocked(authApi.loginEmail);

describe('<Login />', () => {
  beforeEach(() => {
    loginEmailMock.mockReset();
  });

  test('renders email + password fields and submit button', () => {
    renderWithProviders(<Login />);

    expect(screen.getByTestId(AuthTestIds.emailInput)).toBeInTheDocument();
    expect(screen.getByTestId(AuthTestIds.passwordInput)).toBeInTheDocument();
    expect(screen.getByTestId(AuthTestIds.submitButton)).toBeInTheDocument();
  });

  test('shows email validation error for an invalid email', async () => {
    renderWithProviders(<Login />);

    fireEvent.change(screen.getByTestId(AuthTestIds.emailInput), {
      target: { value: 'not-an-email' },
    });
    fireEvent.change(screen.getByTestId(AuthTestIds.passwordInput), {
      target: { value: 'longenough' },
    });
    // Submit via the form element rather than clicking the type=submit
    // button. fireEvent.click would route through HTML5 native form
    // validation, which rejects an `<input type="email">` with a value
    // that has no '@' — the browser intercepts before our handleSubmit
    // runs. fireEvent.submit fires the synthetic submit event React
    // listens to, exercising our custom validateForm directly.
    fireEvent.submit(
      screen.getByTestId(AuthTestIds.emailInput).closest('form')!
    );

    await waitFor(() => {
      expect(screen.getByTestId(AuthTestIds.emailError)).toHaveTextContent(
        'Invalid email format'
      );
    });
    // Submit should not have called the network — validation gates it.
    expect(loginEmailMock).not.toHaveBeenCalled();
  });

  test('shows password length error for short passwords', async () => {
    renderWithProviders(<Login />);

    fireEvent.change(screen.getByTestId(AuthTestIds.emailInput), {
      target: { value: 'alice@ethora.com' },
    });
    fireEvent.change(screen.getByTestId(AuthTestIds.passwordInput), {
      target: { value: 'short' },
    });
    fireEvent.click(screen.getByTestId(AuthTestIds.submitButton));

    await waitFor(() => {
      expect(screen.getByTestId(AuthTestIds.passwordError)).toHaveTextContent(
        'Password must be at least 6 characters long'
      );
    });
    expect(loginEmailMock).not.toHaveBeenCalled();
  });

  test('calls loginEmail with valid credentials', async () => {
    loginEmailMock.mockResolvedValue({
      data: {
        token: 'fake-token',
        refreshToken: 'fake-refresh',
        user: {
          _id: 'u-1',
          firstName: 'Alice',
          lastName: 'Test',
          email: 'alice@ethora.com',
        },
      },
      status: 200,
    } as Awaited<ReturnType<typeof authApi.loginEmail>>);

    renderWithProviders(<Login />);

    fireEvent.change(screen.getByTestId(AuthTestIds.emailInput), {
      target: { value: 'alice@ethora.com' },
    });
    fireEvent.change(screen.getByTestId(AuthTestIds.passwordInput), {
      target: { value: 'TestPass123' },
    });
    fireEvent.click(screen.getByTestId(AuthTestIds.submitButton));

    await waitFor(() => {
      expect(loginEmailMock).toHaveBeenCalledTimes(1);
    });
    expect(loginEmailMock).toHaveBeenCalledWith(
      'alice@ethora.com',
      'TestPass123'
    );
  });
});
