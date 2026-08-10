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
import { deleteRoom as deleteRoomAction, setCurrentRoom } from '../../../roomStore/roomsSlice';
import { useXmppClient } from '../../../context/xmppProvider';
import { useT } from '../../../i18n/useT';

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
  const { client } = useXmppClient();
  const t = useT();

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const handleDeleteChat = async () => {
    try {
      await deleteRoomApi(activeRoom.jid.split('@')[0]);
      // Leave/unsubscribe the MUC so a public room isn't auto-rejoined via XMPP
      // on reload (DELETE succeeds server-side, but the client re-subscribes).
      client?.leaveTheRoomStanza?.(activeRoom.jid);
      dispatch(deleteRoomAction({ jid: activeRoom.jid }));
      dispatch(setCurrentRoom({ roomJID: null }));
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
          <ModalTitle>{t('modal.deleteChat.title')}</ModalTitle>

          <GroupContainer>
            <Button
              onClick={handleCloseModal}
              text={t('action.cancel')}
              style={{ width: '100%' }}
              unstyled
              variant="filled"
            />
            <Button
              onClick={handleDeleteChat}
              text={t('action.delete')}
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
