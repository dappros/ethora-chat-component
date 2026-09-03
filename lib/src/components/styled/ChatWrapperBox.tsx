import React, { forwardRef } from 'react';
import styled from 'styled-components';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { CHAT_ROOT_CLASS, useThemeTokenStyle } from '../../styles/tokens';

// `ethora-chat-root` marks the outermost element of the chat subtree and
// carries the `--ethora-*` design tokens (see src/styles/tokens.ts) as inline
// custom properties, so every instance of <Chat> is themed from its OWN
// config.colors and nothing can leak into the host page. Content rendered
// through a portal (LanguageSelectorModal mounts on document.body) applies
// the same style on its portal container via useThemeTokenStyle.
const ChatWrapperBoxBase = styled.div`
  height: 100%;
  width: 100%;
  position: relative;
  display: flex;
  flex-direction: row;
  /* Base font for the whole chat; descendants inherit family + size.
     Driven by config.typography.{fontFamily,fontSize} via applyTypography. */
  font-family: var(
    --ethora-font-family,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Helvetica,
    Arial,
    sans-serif
  );
  font-size: var(--ethora-font-size, 16px);
`;

type ChatWrapperBoxProps = React.ComponentProps<typeof ChatWrapperBoxBase>;

export const ChatWrapperBox = forwardRef<HTMLDivElement, ChatWrapperBoxProps>(
  ({ style, className, ...rest }, ref) => {
    const { config } = useChatSettingState();
    const tokenStyle = useThemeTokenStyle(config?.colors, config?.typography);
    return (
      <ChatWrapperBoxBase
        ref={ref}
        className={[CHAT_ROOT_CLASS, className].filter(Boolean).join(' ')}
        style={{ ...tokenStyle, ...style }}
        {...rest}
      />
    );
  }
);
ChatWrapperBox.displayName = 'ChatWrapperBox';
