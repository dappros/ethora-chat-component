import styled from 'styled-components';
import {
  ModalBackground,
  ModalContainer,
  ModalContainerFullScreen,
} from './styledModalComponents';
import {
  fadeInAnimation,
  fadeOutAnimation,
  scaleOutAnimation,
} from '../../styles/motion';

/**
 * Exit-animation variants of the shared modal primitives from
 * `styledModalComponents.tsx` (owned by another agent right now - see
 * CLAUDE.md coordination notes, not edited here). `styled(Component)`
 * composition lets these add a `$closing` branch without touching that
 * file: styled-components injects the extending component's class after the
 * base one, so its rules win the cascade for the same element.
 *
 * Used by `Modal.tsx`, `NewChatModal.tsx` and `ModalWrapper.tsx` to fade/
 * scale a modal out instead of letting it vanish when it unmounts.
 */

/**
 * `$closing` fades the scrim back out.
 *
 * This used to skip the fade in the backdrop's old `$drawer` mode, where the
 * scrim was transparent and had nothing to fade. That mode is gone: the
 * profile and settings panels are a layout column now (see SidePanel), so the
 * only things left behind this backdrop are real centred dialogs, and they all
 * want the fade.
 */
export const PresenceModalBackground = styled(ModalBackground)<{
  $closing?: boolean;
}>`
  ${({ $closing }) => $closing && fadeOutAnimation}
`;

export const PresenceModalContainer = styled(ModalContainer)<{
  $closing?: boolean;
}>`
  ${({ $closing }) => $closing && scaleOutAnimation}
`;

// ModalContainerFullScreen has no entrance animation of its own today (it
// fills the backdrop edge to edge, opaque, so only the backdrop's own fade
// ever showed) - add one here along with the exit, so the media viewer
// settles in instead of popping.
export const PresenceModalContainerFullScreen = styled(ModalContainerFullScreen)<{
  $closing?: boolean;
}>`
  ${({ $closing }) => ($closing ? fadeOutAnimation : fadeInAnimation)}
`;
