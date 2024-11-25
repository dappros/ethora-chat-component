import React, { useState } from 'react';
import Button from '../../styled/Button';
import { AddNewIcon, AddPhotoIcon } from '../../../assets/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { StyledInput } from '../../styled/StyledInputComponents/StyledInputComponents';
import { useXmppClient } from '../../../context/xmppProvider';
import {
  CloseButton,
  GroupContainer,
  ModalBackground,
  ModalContainer,
  ModalTitle,
} from '../styledModalComponents';
import { setCurrentRoom } from '../../../roomStore/roomsSlice';

const NewChatModal: React.FC = () => {
  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

  const dispatch = useDispatch();

  const { client } = useXmppClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');
  const [isRoomNameValid, setIsRoomNameValid] = useState(false);
  const [isRoomDescriptionValid, setIsRoomDescriptionValid] = useState(false);

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const handleRoomNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setRoomName(value);
    setIsRoomNameValid(value.length >= 2);
  };

  const handleRoomDescriptionChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    setRoomDescription(value);
    setIsRoomDescriptionValid(value.length >= 2);
  };

  const handleCreateRoom = async () => {
    if (isRoomNameValid && isRoomDescriptionValid) {
      const newChatJid = await client.createRoomStanza(
        roomName,
        roomDescription
      );
      await client.getRooms();
      dispatch(setCurrentRoom({ roomJID: newChatJid }));
      setIsModalOpen(false);
    }
  };

  return (
    <>
      <Button
        style={{
          color: 'black',
          padding: 8,
          borderRadius: '16px',
          backgroundColor: 'transparent',
        }}
        unstyled
        EndIcon={<AddNewIcon color={config?.colors?.primary} />}
        onClick={handleOpenModal}
      />

      {isModalOpen && (
        <ModalBackground>
          <ModalContainer>
            <CloseButton onClick={handleCloseModal} style={{ fontSize: 24 }}>
              &times;
            </CloseButton>
            <ModalTitle>Create New Chat</ModalTitle>
            <Button
              EndIcon={<AddPhotoIcon style={{ borderRadius: 100 }} />}
              style={{
                width: '120px',
                height: '120px',
                borderRadius: 100,
              }}
              unstyled
              onClick={() => console.log('add image')}
            />
            <GroupContainer
              style={{ flexDirection: 'column', position: 'relative' }}
            >
              <StyledInput
                id="roomName"
                value={roomName}
                onChange={handleRoomNameChange}
                placeholder="Enter Room Name"
                style={{
                  borderColor: isRoomNameValid ? 'green' : 'red',
                }}
              />
              <StyledInput
                id="roomDescription"
                value={roomDescription}
                onChange={handleRoomDescriptionChange}
                placeholder="Enter Description"
                style={{
                  borderColor: isRoomDescriptionValid ? 'green' : 'red',
                }}
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
                onClick={handleCreateRoom}
                text={'Create'}
                style={{
                  width: '100%',
                  opacity: isRoomNameValid && isRoomDescriptionValid ? 1 : 0.5,
                  pointerEvents:
                    isRoomNameValid && isRoomDescriptionValid ? 'auto' : 'none',
                }}
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

export default NewChatModal;
