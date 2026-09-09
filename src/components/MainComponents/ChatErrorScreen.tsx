import React from 'react';
import { useT } from '../../i18n/useT';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { resolveIconColor } from '../../helpers/resolveIconColor';

/** Stable test ids for the default crash screen. */
export const ChatErrorScreenTestIds = {
  screen: 'chat_error_screen',
  retryButton: 'chat_error_retry_button',
} as const;

interface ChatErrorScreenProps {
  /** Re-mounts the crashed subtree. */
  onRetry: () => void;
  style?: React.CSSProperties;
}

/**
 * Default fallback rendered by <ChatErrorBoundary> when the chat tree throws.
 *
 * Deliberately calm and small: no stack traces, no red alarm state - an end
 * user of the host application sees this, not a developer. Every caption goes
 * through useT() so it follows the same locale as the rest of the chat, and
 * the accent colour comes from the host's own `config.colors` (via
 * resolveIconColor) plus the `--ethora-font-*` variables the typography
 * config publishes, so it never looks like a foreign screen dropped into a
 * themed app.
 */
const ChatErrorScreen: React.FC<ChatErrorScreenProps> = ({
  onRetry,
  style,
}) => {
  const t = useT();
  const { config } = useChatSettingState();
  const accent = resolveIconColor(config);

  return (
    <div
      role="alert"
      data-testid={ChatErrorScreenTestIds.screen}
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: '12px',
        padding: '24px',
        boxSizing: 'border-box',
        color: 'var(--ethora-color-text, #141414)',
        fontFamily: 'var(--ethora-font-family, Inter, Arial, sans-serif)',
        fontSize: 'var(--ethora-font-size, 16px)',
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 'var(--ethora-font-size-lg, 18px)',
          fontWeight: 600,
        }}
      >
        {t('error.boundary.title')}
      </div>
      <div
        style={{
          fontSize: 'var(--ethora-font-size-sm, 14px)',
          color: 'var(--ethora-color-text-secondary, #5A5F66)',
          maxWidth: '360px',
        }}
      >
        {t('error.boundary.description')}
      </div>
      <button
        type="button"
        onClick={onRetry}
        data-testid={ChatErrorScreenTestIds.retryButton}
        style={{
          marginTop: '4px',
          border: `1px solid ${accent}`,
          borderRadius: '16px',
          background: 'transparent',
          color: accent,
          cursor: 'pointer',
          padding: '8px 20px',
          fontFamily: 'inherit',
          fontSize: 'var(--ethora-font-size-sm, 14px)',
        }}
      >
        {t('error.boundary.retry')}
      </button>
    </div>
  );
};

export default ChatErrorScreen;
