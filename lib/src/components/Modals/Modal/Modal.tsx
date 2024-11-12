import React, { useState } from 'react';
import styled from 'styled-components';
import UserProfileModal from '../UserProfileModal/UserProfileModal';

const ModalBackground = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 1.25em;
  cursor: pointer;
  color: #888;
  border-radius: 8px;
  z-index: 1001;

  &:hover {
    color: #555;
    background-color: #dddddd;
  }
`;

interface ModalProps {
  children?: React.ReactNode;
  modal?: string;
  setOpenModal: any;
}

const Modal: React.FC<ModalProps> = ({ children, modal, setOpenModal }) => {
  const handleCloseModal = () => setOpenModal(false);

  return (
    modal && (
      <ModalBackground id="modal-background">
        <CloseButton onClick={handleCloseModal} style={{ fontSize: 24 }}>
          &times;
        </CloseButton>
        {modal === 'settings' ? (
          <UserProfileModal handleCloseModal={handleCloseModal} />
        ) : (
          <UserProfileModal handleCloseModal={handleCloseModal} />
        )}
        {children}
      </ModalBackground>
    )
  );
};

export default Modal;
