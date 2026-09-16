import React, { useRef } from 'react';
import styled from 'styled-components';
import { ModalType } from '../../../types/types';
import { SIDE_PANEL_MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';
import ModalContent from '../Modal/ModalContent';
// Motion: the panel is a real layout column, so simply unmounting it makes the
// chat snap back to full width with no transition. `useExitTransition` keeps
// the column mounted for one exit animation, and `ModalExitingProvider` tells
// the SideDrawer inside it to play its slide-out. See styles/motion.ts.
import { ModalExitingProvider } from '../../../context/ModalTransitionContext';
import { useExitTransition } from '../../../hooks/useExitTransition';
import { MOTION_BASE_MS } from '../../../styles/motion';

/**
 * The chat's third column: chat profile, user profile, settings, Manage Data
 * and Visibility.
 *
 * These used to be children of the modal overlay layer - a fixed,
 * full-viewport `ModalBackground` with the panel parked against its right
 * edge - so opening one dropped a 400px panel ON TOP of the conversation and
 * the message you were reading disappeared underneath it. This component is
 * rendered as a sibling of the chat pane inside `ChatWrapper`'s flex row
 * instead, so the panel occupies real layout space and the chat simply gets
 * narrower, the way Telegram Web behaves.
 *
 * Which panel is open is still the store's `activeModal` and is still routed
 * through `MODAL_COMPONENTS`; `ModalContent` is the shared router both this
 * and `Modal` use, so there is exactly one source of truth.
 *
 * Below the mobile breakpoint the column goes back to covering everything:
 * three columns cannot fit on a phone, and the panel being the whole screen
 * is the behaviour that was already there. `ChatWrapperInnerBox` is
 * positioned, so `inset: 0` here is the chat's own box, not the host page.
 */

export const SIDE_PANEL_WIDTH_PX = 400;
export const SIDE_PANEL_BREAKPOINT_PX = 767;

const SidePanelColumn = styled.aside`
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  background-color: var(--ethora-color-bg, #fff);

  @media (min-width: ${SIDE_PANEL_BREAKPOINT_PX + 1}px) {
    position: relative;
    inset: auto;
    z-index: auto;
    flex: 0 0 ${SIDE_PANEL_WIDTH_PX}px;
    width: ${SIDE_PANEL_WIDTH_PX}px;
    max-width: 100%;
    height: 100%;
  }
`;

interface SidePanelProps {
  modal?: string;
  setOpenModal: (value?: ModalType) => any;
}

const SidePanel: React.FC<SidePanelProps> = ({ modal, setOpenModal }) => {
  const isPanel = Boolean(modal) && SIDE_PANEL_MODAL_TYPES.includes(modal || '');

  // `modal` clears the moment the panel is closed, but the column still needs
  // one animation to slide out. `shouldRender` holds it on screen for that
  // long and `displayModal` remembers which panel it was, since `modal` is
  // already undefined during the exit window.
  const { shouldRender, isExiting } = useExitTransition(isPanel, MOTION_BASE_MS);
  const lastPanelRef = useRef<string | undefined>(undefined);
  if (isPanel) lastPanelRef.current = modal;
  const displayModal = isPanel ? modal : lastPanelRef.current;

  if (!shouldRender || !displayModal) return null;

  return (
    <ModalExitingProvider value={isExiting}>
      <SidePanelColumn data-testid="side-panel-column">
        <ModalContent modal={displayModal} setOpenModal={setOpenModal} />
      </SidePanelColumn>
    </ModalExitingProvider>
  );
};

export default SidePanel;
