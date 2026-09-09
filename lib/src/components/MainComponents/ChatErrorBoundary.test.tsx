import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import ChatErrorBoundary from './ChatErrorBoundary';
import { ChatErrorScreenTestIds } from './ChatErrorScreen';
import { IConfig } from '../../types/models/config.model';

// The chat is embedded into somebody else's React root. Before this boundary
// existed, a single throw in the chat tree unmounted the HOST's root - the
// two field crashes on record (undefined `config.colors.primary` in the
// router, "Cannot destructure property 'composing'" on leaving a room) took
// the customer's whole app down with them.

// React logs every boundary-caught error to console.error itself, and so do
// we (via ethoraLogger.criticalError). Both are spied rather than silenced so
// the assertions below can prove a real bug is never swallowed: if a future
// change made the boundary quiet, `expect(...).toHaveBeenCalled()` fails.
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  vi.restoreAllMocks();
});

const BOOM = 'Cannot destructure property composing of undefined';

/** Throws on its first mount; after `stopThrowing()` it renders fine. */
const makeFlakyChild = () => {
  let broken = true;
  const Child: React.FC = () => {
    if (broken) throw new Error(BOOM);
    return <div data-testid="chat-tree">chat</div>;
  };
  return { Child, stopThrowing: () => (broken = false) };
};

const Boom: React.FC = () => {
  throw new Error(BOOM);
};

const renderBoundary = (
  config?: IConfig,
  child: React.ReactNode = <Boom />,
  extra?: { silent?: boolean; scope?: 'chat' | 'call-overlay' }
) =>
  renderWithProviders(
    <ChatErrorBoundary config={config} {...extra}>
      {child}
    </ChatErrorBoundary>,
    { preloadedState: { chatSettingStore: { config: config ?? {} } as any } }
  );

describe('ChatErrorBoundary', () => {
  it('catches a throwing child instead of letting it escape to the host', () => {
    // The render itself is the assertion: without the boundary, this throw
    // propagates out of render() and fails the test.
    renderBoundary();

    expect(screen.getByTestId(ChatErrorScreenTestIds.screen)).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('never swallows the error: it is logged with the component stack', () => {
    renderBoundary();

    const ourLog = consoleErrorSpy.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('uncaught render error in "chat"')
    );

    expect(ourLog).toBeTruthy();
    expect((ourLog?.[1] as Error).message).toBe(BOOM);
    // React's component stack, so the crash is locatable from a support log.
    expect(String(ourLog?.[2])).toContain('Boom');
  });

  it('renders the default screen translated into the configured locale', () => {
    renderBoundary({ i18n: { locale: 'fr' } } as IConfig);

    expect(screen.getByText('Une erreur est survenue')).toBeTruthy();
    expect(screen.getByText('Réessayer')).toBeTruthy();
  });

  it('re-mounts the chat subtree when "try again" is clicked', () => {
    const { Child, stopThrowing } = makeFlakyChild();
    renderBoundary(undefined, <Child />);

    expect(screen.getByTestId(ChatErrorScreenTestIds.screen)).toBeTruthy();

    stopThrowing();
    fireEvent.click(screen.getByTestId(ChatErrorScreenTestIds.retryButton));

    expect(screen.getByTestId('chat-tree')).toBeTruthy();
    expect(screen.queryByTestId(ChatErrorScreenTestIds.screen)).toBeNull();
  });

  it('reports the crash to config.eventHandlers.onError', () => {
    const onError = vi.fn();
    renderBoundary({ eventHandlers: { onError } } as IConfig);

    expect(onError).toHaveBeenCalledTimes(1);
    const event = onError.mock.calls[0][0];
    expect(event.error.message).toBe(BOOM);
    expect(event.scope).toBe('chat');
    expect(event.componentStack).toBeTruthy();
  });

  it('survives a host onError handler that throws', () => {
    const onError = vi.fn(() => {
      throw new Error('host reporter is broken');
    });

    // Same defence useEventHandlers applies to the message handlers: the
    // host's own bug must not crash the component that is already handling
    // a crash.
    expect(() =>
      renderBoundary({ eventHandlers: { onError } } as any)
    ).not.toThrow();
    expect(screen.getByTestId(ChatErrorScreenTestIds.screen)).toBeTruthy();
  });

  describe('host-supplied fallback (config.fallbackScreens.error)', () => {
    it('renders a plain string as centered text', () => {
      renderBoundary({
        fallbackScreens: { error: 'Chat is unavailable' },
      } as IConfig);

      expect(screen.getByText('Chat is unavailable')).toBeTruthy();
      expect(screen.queryByTestId(ChatErrorScreenTestIds.screen)).toBeNull();
    });

    it('renders a React node as-is', () => {
      renderBoundary({
        fallbackScreens: { error: <div data-testid="host-node">nope</div> },
      } as IConfig);

      expect(screen.getByTestId('host-node')).toBeTruthy();
    });

    it('passes the error and a working reset to the render-function form', () => {
      const { Child, stopThrowing } = makeFlakyChild();
      const seen: Array<{ message: string; scope: string }> = [];

      renderBoundary(
        {
          fallbackScreens: {
            error: ({ error, scope, reset }) => {
              seen.push({ message: error.message, scope });
              return (
                <button data-testid="host-retry" onClick={reset}>
                  retry
                </button>
              );
            },
          },
        } as IConfig,
        <Child />
      );

      expect(seen[0]).toEqual({ message: BOOM, scope: 'chat' });

      stopThrowing();
      fireEvent.click(screen.getByTestId('host-retry'));
      expect(screen.getByTestId('chat-tree')).toBeTruthy();
    });

    it('falls back to the built-in screen when the host renderer throws', () => {
      renderBoundary({
        fallbackScreens: {
          error: () => {
            throw new Error('host fallback is broken');
          },
        },
      } as IConfig);

      expect(screen.getByTestId(ChatErrorScreenTestIds.screen)).toBeTruthy();
    });
  });

  describe('silent mode (the call overlay)', () => {
    it('renders nothing but still logs and reports', () => {
      const onError = vi.fn();
      renderBoundary({ eventHandlers: { onError } } as IConfig, <Boom />, {
        silent: true,
        scope: 'call-overlay',
      });

      expect(screen.queryByTestId(ChatErrorScreenTestIds.screen)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].scope).toBe('call-overlay');
      expect(
        consoleErrorSpy.mock.calls.some(
          (call) =>
            typeof call[0] === 'string' &&
            call[0].includes('uncaught render error in "call-overlay"')
        )
      ).toBe(true);
    });

    it('ignores a string fallback screen, which does not fit an overlay', () => {
      renderBoundary(
        { fallbackScreens: { error: 'Chat is unavailable' } } as IConfig,
        <Boom />,
        { silent: true, scope: 'call-overlay' }
      );

      expect(screen.queryByText('Chat is unavailable')).toBeNull();
      expect(screen.queryByTestId(ChatErrorScreenTestIds.screen)).toBeNull();
    });
  });

  it('renders its children untouched when nothing throws', () => {
    renderBoundary(undefined, <div data-testid="chat-tree">chat</div>);

    expect(screen.getByTestId('chat-tree')).toBeTruthy();
    expect(screen.queryByTestId(ChatErrorScreenTestIds.screen)).toBeNull();
  });
});
