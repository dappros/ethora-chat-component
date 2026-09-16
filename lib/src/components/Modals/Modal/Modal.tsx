import React, { useRef } from 'react';
import { ModalType } from '../../../types/types';
import { SIDE_PANEL_MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';
import ModalContent from './ModalContent';
// Motion: keeps the outgoing dialog mounted long enough to play its exit
// animation instead of vanishing the instant `modal` clears. See
// styles/motion.ts and context/ModalTransitionContext.tsx for the pieces.
import { PresenceModalBackground } from '../motionVariants';
import { ModalExitingProvider } from '../../../context/ModalTransitionContext';
import { useExitTransition } from '../../../hooks/useExitTransition';
import { MOTION_BASE_MS } from '../../../styles/motion';

interface ModalProps {
  children?: React.ReactNode;
  modal?: string;
  setOpenModal: (value?: ModalType) => any;
}

/**
 * Host for the store-driven modals that really are centred dialogs: the file
 * preview / lightbox. The profile, user, settings, Manage Data and Visibility
 * panels used to render here too, parked against the right edge of this same
 * full-viewport overlay, which is exactly why they covered the conversation.
 * They are rendered by `SidePanel` instead now, as a column of the chat's own
 * flex row, so opening one shrinks the chat rather than hiding it. This
 * component deliberately renders nothing for those types so they can never be
 * painted twice.
 */
const Modal: React.FC<ModalProps> = ({ children, modal, setOpenModal }) => {
  // `modal` clears the instant the host closes it, but the dialog still needs
  // ~MOTION_BASE_MS to play its exit animation. `shouldRender` keeps this
  // component mounted for that long; `displayModal` remembers which dialog it
  // was, since `modal` itself is already undefined during the exit window.
  const isCentredDialog = Boolean(modal) && !SIDE_PANEL_MODAL_TYPES.includes(modal || '');
  const { shouldRender, isExiting } = useExitTransition(
    isCentredDialog,
    MOTION_BASE_MS
  );
  const lastModalRef = useRef<string | undefined>(undefined);
  if (isCentredDialog) lastModalRef.current = modal;
  const displayModal = isCentredDialog ? modal : lastModalRef.current;

  if (!shouldRender || !displayModal) return null;

  return (
    <ModalExitingProvider value={isExiting}>
      <PresenceModalBackground
        id="modal-background"
        $closing={isExiting}
        style={{ position: 'absolute' }}
      >
        <ModalContent modal={displayModal} setOpenModal={setOpenModal} />
        {children}
      </PresenceModalBackground>
    </ModalExitingProvider>
  );
};

export default Modal;
