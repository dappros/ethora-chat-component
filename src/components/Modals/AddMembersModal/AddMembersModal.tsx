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
import { getRooms } from '../../../networking/api-requests/rooms.api';

const AddMembersModal: React.FC = () => {
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
    await client.inviteRoomRequestStanza(userName, activeRoom.jid);
    const rooms = await getRooms();
    // rooms.items.map((room) => {
    //   dispatch(
    //     addRoomViaApi({
    //       room: createRoomFromApi(room, config?.xmppSettings?.conference),
    //       xmpp: newClient,
    //     })
    //   );
    // });
    // dispatch(updateUsersSet({ rooms: rooms.items }));
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
                onChange={setUserName}
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
