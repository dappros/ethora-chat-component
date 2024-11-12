import React, { useState } from 'react';
import styled from 'styled-components';
import Button from '../../styled/Button';
import { AddNewIcon, AddPhotoIcon } from '../../../assets/icons';
import { useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { StyledInput } from '../../styled/StyledInputComponents/StyledInputComponents';

const ModalBackground = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContainer = styled.div`
  background: white;
  border-radius: 24px;
  padding: 32px;
  box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 32px;
  position: relative;
  justify-content: center;
  align-items: center;
  width: 50%;
  max-width: 400px;
`;

const ModalTitle = styled.h2`
  font-size: 1.5em;
  margin: 0;
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

  &:hover {
    color: #555;
    background-color: #dddddd;
  }
`;

const GroupContainer = styled.div`
  display: flex;
  gap: 32px;
  width: 100%;
  padding: 0;
`;

const NewChatModal: React.FC = () => {
  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomDescription, setRoomDescription] = useState('');

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const handleCreateRoom = () => {
    console.log('Room Created:', roomName, roomDescription);
    setIsModalOpen(false);
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
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Enter Room Name"
              />

              <StyledInput
                id="roomDescription"
                value={roomDescription}
                onChange={(e) => setRoomDescription(e.target.value)}
                placeholder="Enter Description"
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

export default NewChatModal;
