import React from 'react';
import { Provider, ReactReduxContext } from 'react-redux';
import { store } from '../../roomStore';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import { ChatErrorScope, IConfig } from '../../types/models/config.model';
import FallbackScreen from './FallbackScreen';
import ChatErrorScreen from './ChatErrorScreen';

interface ChatErrorBoundaryProps {
  children: React.ReactNode;
  /** Host config: supplies `fallbackScreens.error` and `eventHandlers.onError`. */
  config?: IConfig;
  /** Which part of the SDK crashed. Reported to the host and logged. */
  scope?: ChatErrorScope;
  /**
   * Render nothing at all after a crash instead of the default screen. Used
   * for the call overlay, where a full-size "something went wrong" panel
   * would sit on top of the host application forever.
   */
  silent?: boolean;
}

interface ChatErrorBoundaryState {
  error: Error | null;
  componentStack?: string;
  /** Bumped by "try again"; keying the subtree on it forces a re-mount. */
  resetCount: number;
}

/**
 * The default screen reads the host's colours and locale out of redux (useT,
 * useChatSettingState), so it needs a store above it. Normally there is one -
 * the boundary sits inside <Chat>'s own <Provider> - and that one must win,
 * since it is the one holding the host's config. Only when the boundary is
 * mounted with no provider at all do we supply the module singleton, so an
 * out-of-tree usage renders a themed screen instead of throwing a second
 * error out of the fallback.
 */
const EnsureStore: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const existing = React.useContext(ReactReduxContext);
  if (existing) return <>{children}</>;
  return <Provider store={store}>{children}</Provider>;
};

/**
 * The SDK's crash barrier.
 *
 * `@ethora/chat-component` renders inside somebody else's application. Without
 * a boundary, one uncaught render error anywhere in the chat tree unmounts the
 * host's whole React root - the customer's app white-screens because of a bug
 * in ours. That has already happened twice in the field (a router crash on an
 * undefined `config.colors.primary`, and "Cannot destructure property
 * 'composing'" when leaving a room), so the barrier is not hypothetical.
 *
 * Behaviour:
 *  - the error is never swallowed: it is always logged through
 *    `ethoraLogger.criticalError` together with the React component stack;
 *  - the host can be notified via `config.eventHandlers.onError` (wrapped so a
 *    throw inside the host's own handler cannot crash the boundary, the same
 *    defence useEventHandlers applies to the message handlers);
 *  - the host can replace the screen via `config.fallbackScreens.error`, which
 *    follows the same shape as `noUser` / `noConnection` / `noRoom` (string =
 *    centered text, React node = rendered as-is) and additionally accepts a
 *    render function receiving `{ error, componentStack, scope, reset }`;
 *  - "try again" clears the error and re-mounts the subtree, because most of
 *    these crashes are transient state problems that a fresh mount fixes.
 */
class ChatErrorBoundary extends React.Component<
  ChatErrorBoundaryProps,
  ChatErrorBoundaryState
> {
  state: ChatErrorBoundaryState = {
    error: null,
    componentStack: undefined,
    resetCount: 0,
  };

  static getDerivedStateFromError(
    error: Error
  ): Partial<ChatErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const scope = this.props.scope ?? 'chat';
    const componentStack = errorInfo?.componentStack ?? undefined;

    this.setState({ componentStack });

    // Always logged, whatever the verbose-console setting is: a crash the
    // host cannot see is a support ticket nobody can answer.
    ethoraLogger.criticalError(
      `[ethora-chat] uncaught render error in "${scope}":`,
      error,
      componentStack
    );

    const onError = this.props.config?.eventHandlers?.onError;
    if (!onError) return;
    try {
      onError({ error, componentStack, scope });
    } catch (handlerError) {
      // A throwing host handler must not take down the boundary that is
      // already handling a crash.
      ethoraLogger.criticalError(
        '[ethora-chat] config.eventHandlers.onError threw:',
        handlerError
      );
    }
  }

  reset = (): void => {
    this.setState((prev) => ({
      error: null,
      componentStack: undefined,
      resetCount: prev.resetCount + 1,
    }));
  };

  private renderFallback(error: Error): React.ReactNode {
    const { config, silent, scope } = this.props;
    const hostFallback = config?.fallbackScreens?.error;

    if (typeof hostFallback === 'function') {
      try {
        return (
          <>
            {hostFallback({
              error,
              componentStack: this.state.componentStack,
              scope: scope ?? 'chat',
              reset: this.reset,
            })}
          </>
        );
      } catch (renderError) {
        // Same reasoning as the onError guard: fall back to our own screen
        // rather than letting the host's fallback crash the host app.
        ethoraLogger.criticalError(
          '[ethora-chat] config.fallbackScreens.error renderer threw:',
          renderError
        );
      }
    } else if (hostFallback != null && !silent) {
      // A plain string/node is a "screen", which only makes sense where a
      // screen belongs. In silent mode (the call overlay) the host can still
      // render something of its own, but only through the function form,
      // which receives `scope` and can decide for itself.
      return <FallbackScreen content={hostFallback} />;
    }

    if (silent) return null;

    return (
      <EnsureStore>
        <ChatErrorScreen onRetry={this.reset} />
      </EnsureStore>
    );
  }

  render(): React.ReactNode {
    const { error, resetCount } = this.state;

    if (error) return this.renderFallback(error);

    // Keyed so `reset()` re-mounts the children instead of re-rendering a
    // subtree that is still holding the state that crashed it.
    return (
      <React.Fragment key={resetCount}>{this.props.children}</React.Fragment>
    );
  }
}

export default ChatErrorBoundary;
