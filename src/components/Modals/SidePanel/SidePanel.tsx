import React from 'react';
import styled from 'styled-components';
import { ModalType } from '../../../types/types';
import { SIDE_PANEL_MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';
import ModalContent from '../Modal/ModalContent';

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
  if (!modal || !SIDE_PANEL_MODAL_TYPES.includes(modal)) return null;

  return (
    <SidePanelColumn data-testid="side-panel-column">
      <ModalContent modal={modal} setOpenModal={setOpenModal} />
    </SidePanelColumn>
  );
};

export default SidePanel;
