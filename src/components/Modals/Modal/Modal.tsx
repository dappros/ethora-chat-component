import React from 'react';
import UserProfileModal from '../UserProfileModal/UserProfileModal';
import { ModalBackground } from '../styledModalComponents';
import UserSettingsModal from '../UserSettingsModal/UserSettingsModal';
import ChatProfileModal from '../ChatProfileModal/ChatProfileModal';

interface ModalProps {
  children?: React.ReactNode;
  modal?: string;
  setOpenModal: (value?: 'settings' | 'profile' | 'chatprofile') => any;
}

const Modal: React.FC<ModalProps> = ({ children, modal, setOpenModal }) => {
  const handleCloseModal = () => setOpenModal();

  const renderModalContent = () => {
    switch (modal) {
      case 'settings':
        return <UserSettingsModal handleCloseModal={handleCloseModal} />;
      case 'profile':
        return <UserProfileModal handleCloseModal={handleCloseModal} />;
      case 'chatprofile':
        return <ChatProfileModal handleCloseModal={handleCloseModal} />;
      default:
        return null;
    }
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
