import React, { useState } from 'react';
import Button from '../../styled/Button';
import { useDispatch, useSelector } from 'react-redux';
import { getActiveRoom, RootState } from '../../../roomStore';
import {
  CloseButton,
  GroupContainer,
  ModalBackground,
  ModalContainer,
  ModalTitle,
} from '../styledModalComponents';
import { deleteRoom as deleteRoomApi } from '../../../networking/api-requests/rooms.api';
import { deleteRoom as deleteRoomAction } from '../../../roomStore/roomsSlice';

interface DeleteChatModalProps {
  isModalOpen: boolean;
  setIsModalOpen: (isOpen: boolean) => void;
}

const DeleteChatModal: React.FC<DeleteChatModalProps> = ({
  isModalOpen,
  setIsModalOpen,
}) => {
  const dispatch = useDispatch();
  const activeRoom = useSelector((state: RootState) => getActiveRoom(state));

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const handleDeleteChat = async () => {
    try {
      await deleteRoomApi(activeRoom.jid.split('@')[0]);
      dispatch(deleteRoomAction({ jid: activeRoom.jid }));
      handleCloseModal();
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  };

  return (
    isModalOpen && (
      <ModalBackground>
        <ModalContainer>
          <CloseButton onClick={handleCloseModal} style={{ fontSize: 24 }}>
            &times;
          </CloseButton>
          <ModalTitle>Delete this chat ?</ModalTitle>

          <GroupContainer>
            <Button
              onClick={handleCloseModal}
              text={'Cancel'}
              style={{ width: '100%' }}
              unstyled
              variant="filled"
            />
            <Button
              onClick={handleDeleteChat}
              text={'Delete'}
              style={{ width: '100%', border: '1px solid red', color: 'red' }}
              unstyled
              variant="outlined"
            />
          </GroupContainer>
        </ModalContainer>
      </ModalBackground>
    )
  );
};

export default DeleteChatModal;
