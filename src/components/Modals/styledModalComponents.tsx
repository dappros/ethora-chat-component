import styled, { css } from 'styled-components';
import Button, { ButtonProps } from '../styled/Button';
import {
  fadeInAnimation,
  fadeOutAnimation,
  scaleInAnimation,
  scaleOutAnimation,
} from '../../styles/motion';

// `$anchorTop`: most modals here are a fixed-height single step, so
// vertically centering them (the default) is fine - their height never
// changes while open. NewChatModal's inline "Private" user picker is the
// exception: it grows/collapses the card's content height live, and a
// vertically-centered card visibly repositions its ENTIRE chrome (close
// button, title, avatar) on every frame of that reveal, because the
// centering math re-runs against a new height each frame - that's what
// read as "broken" during the toggle. Anchoring the card near the top
// instead means growth only ever extends downward from a fixed top edge,
// so the existing chrome never moves. Scoped to a per-instance prop
// (rather than changing the default) so every other modal keeps its
// current centered look untouched.
// This surface is only ever a scrim now: the profile/settings family that
// used to borrow it in a transparent "drawer" mode has moved out of the
// overlay layer entirely and into the chat's own flex row (see
// `components/Modals/SidePanel/SidePanel.tsx`), so what is left here is
// centred dialogs - the file preview and the confirm cards.
export const ModalBackground = styled.div<{
  $anchorTop?: boolean;
}>`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(16, 24, 40, 0.45);
  display: flex;
  justify-content: center;
  align-items: ${({ $anchorTop }) => ($anchorTop ? 'flex-start' : 'center')};
  z-index: 1000;
  ${fadeInAnimation}

  ${({ $anchorTop }) =>
    $anchorTop &&
    css`
      overflow-y: auto;
      padding-top: max(5vh, 32px);
      padding-bottom: 32px;
      box-sizing: border-box;
    `}

  @media (max-width: 480px) {
    padding-left: 16px;
    padding-right: 16px;
    box-sizing: border-box;
    ${({ $anchorTop }) =>
      $anchorTop &&
      css`
        padding-top: 16px;
      `}
  }
`;

export const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  background: transparent;
  border: none;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  color: var(--ethora-color-text-muted, #8c8c8c);
  border-radius: 50%;
  transition:
    background-color var(--ethora-motion-fast, 150ms),
    color var(--ethora-motion-fast, 150ms),
    transform var(--ethora-motion-fast, 150ms);

  &:hover {
    color: var(--ethora-color-text, #141414);
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
    transform: rotate(90deg);
  }

  &:active {
    transform: rotate(90deg) scale(0.94);
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }

  @media (max-width: 480px) {
    top: 12px;
    right: 12px;
  }
`;

export const ModalContainer = styled.div.attrs({
  role: 'dialog',
  'aria-modal': 'true',
})`
  background: var(--ethora-color-bg, #fff);
  border-radius: var(--ethora-radius-lg, 16px);
  padding: 32px 64px;
  box-shadow: var(--ethora-shadow-lg, 0 12px 32px rgba(16, 24, 40, 0.14));
  display: flex;
  flex-direction: column;
  gap: 32px;
  position: relative;
  justify-content: center;
  align-items: center;
  width: 50%;
  max-width: 400px;
  box-sizing: border-box;
  /* Content is no longer a fixed-height single step - e.g. NewChatModal's
     inline "Private" user picker can push this taller than the viewport on
     short/mobile screens. Cap to the viewport and let the card itself
     scroll instead of overflowing past the screen edges. */
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  ${scaleInAnimation}

  @media (max-width: 480px) {
    width: 100%;
    max-width: 100%;
    max-height: calc(100vh - 32px);
    padding: 24px 20px;
    gap: 20px;
  }
`;

export const ModalTitle = styled.h2`
  font-size: 1.5em;
  margin: 0;
  font-weight: 400;
  color: var(--ethora-color-text, #141414);
  text-align: center;

  @media (max-width: 480px) {
    font-size: 1.2em;
  }
`;

/** New-chat dialog keeps its chrome and actions visible while a long member
 * picker scrolls independently in the middle. */
export const NewChatDialog = styled(ModalContainer)<{ $closing?: boolean }>`
  width: min(100%, 440px);
  max-width: 440px;
  max-height: min(760px, calc(100dvh - 48px));
  padding: 28px 32px 24px;
  gap: 20px;
  overflow: hidden;
  justify-content: flex-start;
  font-family: var(
    --ethora-font-family,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    sans-serif
  );
  &,
  & * {
    font-family: inherit;
  }
  ${({ $closing }) => $closing && scaleOutAnimation}

  @media (max-width: 480px) {
    width: 100%;
    max-width: 100%;
    max-height: calc(100dvh - max(12px, env(safe-area-inset-top)) - 8px);
    padding: 20px 20px 16px;
    gap: 14px;
    border-radius: 20px 20px 16px 16px;
  }
`;

export const NewChatBackdrop = styled(ModalBackground)<{ $closing?: boolean }>`
  ${({ $closing }) => $closing && fadeOutAnimation}
  @media (max-width: 480px) {
    align-items: flex-end;
    padding: 0 12px max(12px, env(safe-area-inset-bottom));
  }
`;

export const NewChatDialogHeader = styled.header`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 100%;
  min-height: 40px;
`;

export const NewChatDialogBody = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  width: 100%;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding: 4px 4px 8px;
  box-sizing: border-box;

  @media (max-width: 480px) {
    gap: 16px;
  }
`;

export const NewChatDialogFooter = styled.footer`
  display: flex;
  flex: 0 0 auto;
  width: 100%;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--ethora-color-border, #e6e8ec);
`;

/** Small uppercase-weight label above a field/list inside a modal - e.g. "Select Users (max 20)". */
export const ModalSectionLabel = styled.div`
  width: 100%;
  font-size: var(--ethora-font-size-sm, 14px);
  font-weight: var(--ethora-font-weight-semibold, 600);
  color: var(--ethora-color-text, #141414);
`;

export const ModalDescription = styled.p`
  font-size: 14px;
  margin: 0;
  font-weight: 400;
`;

export const GroupContainer = styled.div`
  display: flex;
  gap: 32px;
  width: 100%;
  padding: 0;
`;

export const ModalContainerFullScreen = styled.div.attrs({
  role: 'dialog',
  'aria-modal': 'true',
})`
  width: 100%;
  height: 100%;
  background-color: var(--ethora-color-bg, #fff);
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
  overflow-y: auto;
`;

export const HeaderContainer = styled(GroupContainer)`
  position: sticky;
  top: 0;
  width: 100%;
  padding: 16px;
  background-color: var(--ethora-color-bg, #fff);
  box-sizing: border-box;
  border-bottom: 1px solid var(--ethora-color-border, #f0f0f0);
  z-index: 1;
  justify-content: space-between;
`;

export const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

export const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

export const CenterContainer = styled(GroupContainer)`
  width: 52.5%;
  padding: 16px;
  flex-direction: column;
  align-items: center;
`;

export const UserName = styled.div`
  color: var(--ethora-color-text, #141414);
  font-size: 24px;
  font-weight: 400;
`;

export const Label = styled.span`
  color: var(--ethora-color-text, #141414);
  font-size: 16px;
`;

export const ActionButton = styled(Button)`
  width: 100%;
`;

export const Divider = styled.div`
  height: 1px;
  width: 100%;
  background-color: var(--ethora-color-border, #0052cd0d);
`;
