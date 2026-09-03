import styled from 'styled-components';

// `ethora-chat-root` marks the outermost element of the chat subtree. The
// `--ethora-*` design tokens (see src/styles/tokens.ts) are published on
// `document.documentElement` rather than this class alone, so that content
// rendered through a portal (e.g. LanguageSelectorModal, which mounts on
// document.body) still resolves them - see ThemeTokens' doc comment in
// styles/tokens.ts for why that is still leak-safe. The class stays on this
// element for CSS scoping/debuggability and as a stable hook for any future
// portal-container-scoped approach.
export const ChatWrapperBox = styled.div.attrs({
  className: 'ethora-chat-root',
})`
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
