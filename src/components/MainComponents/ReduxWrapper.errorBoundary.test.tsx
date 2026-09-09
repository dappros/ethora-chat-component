import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Same stubbing approach as ReduxWrapper.themeConfig.test.tsx: everything
// below <ReduxWrapper>'s own enablers is replaced, so the test is about one
// thing only - does a crash inside the chat tree stay inside the chat tree?
// Here LoginWrapper is the component that throws, standing in for the real
// field crashes (undefined `config.colors.primary` in the router, "Cannot
// destructure property 'composing'" on leaving a room).
vi.mock('./LoginWrapper.tsx', () => ({
  default: () => {
    throw new Error('boom in the chat tree');
  },
}));
vi.mock('../../hooks/useInAppNotifications', () => ({
  useInAppNotifications: () => {},
}));
vi.mock('../../hooks/usePushNotifications', () => ({
  default: () => ({ requestPermission: vi.fn() }),
}));
vi.mock('../Notification/NotificationPermissionBanner', () => ({
  default: () => null,
}));

import { ReduxWrapper } from './ReduxWrapper';
import { ChatErrorScreenTestIds } from './ChatErrorScreen';

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('<Chat> (ReduxWrapper) contains its own crashes', () => {
  it('renders the fallback screen and leaves the host tree mounted', async () => {
    render(
      <div>
        <div data-testid="host-app">host app content</div>
        <ReduxWrapper config={{ colors: { primary: '#5E3FDE' } } as any} />
      </div>
    );

    await waitFor(() => {
      expect(screen.getByTestId(ChatErrorScreenTestIds.screen)).toBeTruthy();
    });

    // The whole point of the boundary: the host's subtree is untouched.
    expect(screen.getByTestId('host-app')).toBeTruthy();

    // And the crash is still visible to whoever reads the console/logs.
    expect(
      consoleErrorSpy.mock.calls.some(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('uncaught render error in "chat"')
      )
    ).toBe(true);
  });

  it('hands the crash to the host callback and honours its fallback screen', async () => {
    const onError = vi.fn();

    render(
      <ReduxWrapper
        config={
          {
            eventHandlers: { onError },
            fallbackScreens: { error: 'Chat is temporarily unavailable' },
          } as any
        }
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Chat is temporarily unavailable')).toBeTruthy();
    });
    expect(screen.queryByTestId(ChatErrorScreenTestIds.screen)).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].scope).toBe('chat');
  });
});
