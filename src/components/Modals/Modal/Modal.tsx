import React from 'react';
import { ModalBackground } from '../styledModalComponents';
import { ModalType } from '../../../types/types';
import { useDispatch } from 'react-redux';
import { setActiveModal } from '../../../roomStore/chatSettingsSlice';
import {
  MODAL_COMPONENTS,
  MODAL_TYPES,
} from '../../../helpers/constants/MODAL_TYPES';

interface ModalProps {
  children?: React.ReactNode;
  modal?: string;
  setOpenModal: (value?: ModalType) => any;
}

const Modal: React.FC<ModalProps> = ({ children, modal, setOpenModal }) => {
  const dispatch = useDispatch();
  const handleCloseModal = () => setOpenModal();
  const handleBackButtonClick = () =>
    dispatch(setActiveModal(MODAL_TYPES.SETTINGS));

  const renderModalContent = () => {
    const ModalComponent = MODAL_COMPONENTS[modal];

    if (!ModalComponent) return null;

    const handleClose =
      modal === MODAL_TYPES.MANAGE_DATA ||
      modal === MODAL_TYPES.VISIBILITY ||
      modal === MODAL_TYPES.REFERRALS ||
      modal === MODAL_TYPES.DOCUMENT_SHARES ||
      modal === MODAL_TYPES.PROFILE_SHARES ||
      modal === MODAL_TYPES.BLOCKED_USERS
        ? handleBackButtonClick
        : handleCloseModal;

    return <ModalComponent handleCloseModal={handleClose} />;
  };
  return (
    modal && (
      <ModalBackground id="modal-background" style={{ position: 'absolute' }}>
        {renderModalContent()}
        {children}
      </ModalBackground>
    )
  );
};

export default Modal;
