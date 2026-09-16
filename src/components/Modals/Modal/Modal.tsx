import React from 'react';
import { ModalBackground } from '../styledModalComponents';
import { ModalType } from '../../../types/types';
import { SIDE_PANEL_MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';
import ModalContent from './ModalContent';

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
  if (!modal || SIDE_PANEL_MODAL_TYPES.includes(modal)) return null;

  return (
    <ModalBackground id="modal-background" style={{ position: 'absolute' }}>
      <ModalContent modal={modal} setOpenModal={setOpenModal} />
      {children}
    </ModalBackground>
  );
};

export default Modal;
