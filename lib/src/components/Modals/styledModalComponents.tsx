import styled, { css } from 'styled-components';
import Button, { ButtonProps } from '../styled/Button';
import { fadeInAnimation, scaleInAnimation } from '../../styles/motion';

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
// `$drawer`: the profile/settings panels open as a right-hand side drawer on
// desktop instead of a centred card, and the whole point of a drawer is that
// the room list and the chat stay visible AND clickable behind it. So in this
// mode the background stops being a scrim: it is transparent, it does not
// swallow pointer events (the panel itself opts back in), and it parks its
// child against the right edge at full height. Below the 768px breakpoint
// ChatWrapper already switches to one-pane-at-a-time, so there the panel goes
// full-screen and the background is simply the surface it sits on.
export const ModalBackground = styled.div<{
  $anchorTop?: boolean;
  $drawer?: boolean;
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

  ${({ $drawer }) =>
    $drawer &&
    css`
      background: transparent;
      pointer-events: none;
      justify-content: flex-end;
      align-items: stretch;
      animation: none;
    `}

  ${({ $anchorTop }) =>
    $anchorTop &&
    css`
      overflow-y: auto;
      padding-top: max(5vh, 32px);
      padding-bottom: 32px;
      box-sizing: border-box;
    `}

  @media (max-width: 480px) {
    /* A drawer is edge-to-edge at this size, so it must not inherit the
       card gutters that keep centred modals off the screen edges. */
    ${({ $drawer }) =>
      !$drawer &&
      css`
        padding-left: 16px;
        padding-right: 16px;
        box-sizing: border-box;
      `}
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
  background: none;
  border: none;
  font-size: 1.25em;
  cursor: pointer;
  color: var(--ethora-color-text-muted, #8c8c8c);
  border-radius: var(--ethora-radius-sm, 8px);
  transition: background-color var(--ethora-motion-fast, 150ms);

  &:hover {
    color: var(--ethora-color-text, #141414);
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }
`;

export const ModalContainer = styled.div.attrs({ role: 'dialog', 'aria-modal': 'true' })`
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

/** Small uppercase-weight label above a field/list inside a modal - e.g. "Select Users (max 20)". */
export const ModalSectionLabel = styled.div`
  width: 100%;
  font-size: var(--ethora-font-size-sm, 14px);
  font-weight: var(--ethora-font-weight-semibold, 600);
  color: var(--ethora-color-text, #141414);
`;

/** 48px-min-height row used for members/blocked-users/etc. lists inside modals. */
export const ModalListRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--ethora-space-3, 12px);
  min-height: 48px;
  padding: 0 var(--ethora-space-2, 8px);
  border-radius: var(--ethora-radius-sm, 8px);
  transition: background-color var(--ethora-motion-fast, 150ms);

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }
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

export const ModalContainerFullScreen = styled.div.attrs({ role: 'dialog', 'aria-modal': 'true' })`
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

export const ProfileImage = styled.div`
  width: 120px;
  height: 120px;
  border-radius: var(--ethora-radius-full, 10000px);
  border: 1px solid var(--ethora-color-border, #f0f0f0);
`;

export const UserInfo = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

export const UserName = styled.div`
  color: var(--ethora-color-text, #141414);
  font-size: 24px;
  font-weight: 400;
`;

export const UserStatus = styled.div`
  color: var(--ethora-color-text-muted, #8c8c8c);
  font-size: 16px;
  font-weight: 400;
`;

export const BorderedContainer = styled.div`
  width: 100%;
  border-radius: var(--ethora-radius-sm, 8px);
  border: 1px solid var(--ethora-color-border, #f0f0f0);
  display: flex;
  flex-direction: column;
  padding: 16px;
`;

export const LabelData = styled.div`
  color: var(--ethora-color-text-muted, #8c8c8c);
  font-size: 14px;
  font-weight: 400;
`;

export const Label = styled.span`
  color: var(--ethora-color-text, #141414);
  font-size: 16px;
`;

export const ActionButton = styled(Button)`
  width: 100%;
`;

export const EmptySection = styled.div`
  height: 200px;
  border: 1px solid var(--ethora-color-border, #f0f0f0);
  border-radius: var(--ethora-radius-sm, 8px);
  width: 100%;
  display: flex;
`;

export const Divider = styled.div`
  height: 1px;
  width: 100%;
  background-color: var(--ethora-color-border, #0052cd0d);
`;
