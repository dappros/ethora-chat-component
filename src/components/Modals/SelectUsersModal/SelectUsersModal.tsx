import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { getActiveRoom, RootState } from '../../../roomStore';
import {
  ActionButton,
  CloseButton,
  GroupContainer,
  ModalBackground,
  ModalContainer,
} from '../styledModalComponents';
import Button from '../../styled/Button';
import { RoomMember } from '../../../types/types';
import UsersList from '../../UsersList/UsersList';
import Loader from '../../styled/Loader';
import { postAddRoomMember } from '../../../networking/api-requests/rooms.api';

const SelectUsersModal: React.FC = () => {
  const [loading, setIsLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<RoomMember[]>([]);
  const activeRoom = useSelector((state: RootState) => getActiveRoom(state));

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUsers([]);
  };

  const handleAdd = async () => {
    setIsLoading(true);
    console.log('Selected users:', selectedUsers);

    try {
      await Promise.all(
        selectedUsers.map((user) =>
          postAddRoomMember({
            chatName: activeRoom.jid.split('@')[0],
            username: user.xmppUsername,
          })
        )
      );
    } catch (error) {
      console.error('Error adding users:', error);
    }

    handleCloseModal();
    setIsLoading(false);
  };

  return (
    <>
      <ActionButton variant="filled" unstyled onClick={handleOpenModal}>
        Add more Users
      </ActionButton>

      {isModalOpen && (
        <ModalBackground>
          <ModalContainer>
            <CloseButton onClick={handleCloseModal} style={{ fontSize: 24 }}>
              &times;
            </CloseButton>
            <UsersList
              selectedUsers={selectedUsers}
              setSelectedUsers={setSelectedUsers}
              style={{ minHeight: '200px' }}
            />
            <GroupContainer>
              <Button
                onClick={handleCloseModal}
                text="Cancel"
                style={{ width: '100%' }}
                unstyled
                variant="outlined"
              />
              {loading ? (
                <Loader />
              ) : (
                <Button
                  onClick={handleAdd}
                  text="Add"
                  style={{ width: '100%' }}
                  unstyled
                  variant="filled"
                />
              )}
            </GroupContainer>
          </ModalContainer>
        </ModalBackground>
      )}
    </>
  );
};

export default SelectUsersModal;
