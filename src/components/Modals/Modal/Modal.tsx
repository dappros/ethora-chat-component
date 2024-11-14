import React from 'react';
import UserProfileModal from '../UserProfileModal/UserProfileModal';
import { ModalBackground } from '../styledModalComponents';
import UserSettingsModal from '../UserSettingsModal/UserSettingsModal';

interface ModalProps {
  children?: React.ReactNode;
  modal?: string;
  setOpenModal: (value?: 'settings' | 'profile') => any;
}

const Modal: React.FC<ModalProps> = ({ children, modal, setOpenModal }) => {
  const handleCloseModal = () => setOpenModal();

  return (
    modal && (
      <ModalBackground id="modal-background" style={{ position: 'absolute' }}>
        {/* <CloseButton onClick={handleCloseModal} style={{ fontSize: 24 }}>
          &times;
        </CloseButton> */}
        {modal === 'settings' ? (
          <UserSettingsModal handleCloseModal={handleCloseModal} />
        ) : (
          <UserProfileModal handleCloseModal={handleCloseModal} />
        )}
        {children}
      </ModalBackground>
    )
  );
};

export default Modal;
