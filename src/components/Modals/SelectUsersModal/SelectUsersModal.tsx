import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
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
import { useToast } from '../../../context/ToastContext';
import { updateRoom } from '../../../roomStore/roomsSlice';

const SelectUsersModal: React.FC = () => {
  const { showToast } = useToast();
  const dispatch = useDispatch();

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
    const existingXmppUsernames = activeRoom.members.map(
      (member) => member.xmppUsername
    );

    const usersArray = selectedUsers
      .filter((user) => !existingXmppUsernames.includes(user.xmppUsername))
      .map((user) => user.xmppUsername);

    try {
      const newMembers = await postAddRoomMember({
        chatName: activeRoom.jid.split('@')[0],
        members: usersArray,
      });
      dispatch(
        updateRoom({
          jid: activeRoom.jid,
          updates: {
            members: [...newMembers, ...activeRoom.members],
            usersCnt: activeRoom.members.length + newMembers.length,
          },
        })
      );
      showToast({
        id: Date.now().toString(),
        title: 'Success!',
        message: 'Room created succusfully!',
        type: 'success',
        duration: 3000,
      });
    } catch (error) {
      console.error('Error adding users:', error);
      setIsLoading(false);
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
            <GroupContainer
              style={{
                flexDirection: 'column',
                position: 'relative',
                boxSizing: 'border-box',
                width: '100%',
                minHeight: '400px',
              }}
            >
              <UsersList
                selectedUsers={selectedUsers}
                setSelectedUsers={setSelectedUsers}
                style={{
                  minWidth: '100%',
                  width: '100%',
                  maxHeight: '340px',
                }}
                headerElement={false}
              />
            </GroupContainer>
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
