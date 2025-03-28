import React, { useState } from 'react';
import Button from '../../styled/Button';
import { useDispatch, useSelector } from 'react-redux';
import { getActiveRoom, RootState } from '../../../roomStore';
import { useXmppClient } from '../../../context/xmppProvider';
import {
  ActionButton,
  CloseButton,
  GroupContainer,
  ModalBackground,
  ModalContainer,
  ModalTitle,
} from '../styledModalComponents';
import InputWithLabel from '../../styled/StyledInput';
import {
  getRoomByName,
  postAddRoomMember,
} from '../../../networking/api-requests/rooms.api';
import { addRoomViaApi } from '../../../roomStore/roomsSlice';
import { createRoomFromApi } from '../../../helpers/createRoomFromApi';
import { useChatSettingState } from '../../../hooks/useChatSettingState';

const AddMembersModal: React.FC = () => {
  const { config } = useChatSettingState();
  const activeRoom = useSelector((state: RootState) => getActiveRoom(state));

  const dispatch = useDispatch();
  const { client } = useXmppClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userName, setUserName] = useState('');

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const validateRoomName = (name: string) => {
    if (name.trim().length < 3) {
      return 'Room name must be at least 3 characters.';
    }
    return '';
  };

  const handleAddUser = async () => {
    try {
      await postAddRoomMember({
        chatName: activeRoom.jid.split('@')[0],
        username: userName,
      });
      handleCloseModal();
      await client.inviteRoomRequestStanza(userName, activeRoom.jid);

      const room = await getRoomByName(activeRoom.jid);
      dispatch(
        addRoomViaApi({
          room: createRoomFromApi(room, config?.xmppSettings?.conference),
          xmpp: client,
        })
      );
    } catch (error) {
      console.error('Failed to add user:', error);
    }
  };

  const handleUserNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUserName(event.target.value);
  };

  return (
    <>
      <ActionButton variant="filled" unstyled onClick={handleOpenModal}>
        Add members
      </ActionButton>

      {isModalOpen && (
        <ModalBackground>
          <ModalContainer>
            <CloseButton onClick={handleCloseModal} style={{ fontSize: 24 }}>
              &times;
            </CloseButton>
            <ModalTitle>Add New Member</ModalTitle>
            <GroupContainer
              style={{
                flexDirection: 'column',
                position: 'relative',
                boxSizing: 'border-box',
                width: '100%',
              }}
            >
              <InputWithLabel
                style={{ flex: 1 }}
                id="userName"
                value={userName}
                onChange={handleUserNameChange}
                placeholder="Enter User Id"
              />
            </GroupContainer>

            <GroupContainer>
              <Button
                onClick={handleCloseModal}
                text={'Cancel'}
                style={{ width: '100%' }}
                unstyled
                variant="outlined"
              />
              <Button
                onClick={handleAddUser}
                text={'Add'}
                style={{ width: '100%' }}
                unstyled
                variant="filled"
              />
            </GroupContainer>
          </ModalContainer>
        </ModalBackground>
      )}
    </>
  );
};

export default AddMembersModal;
