import React, { useState, useEffect, useMemo } from 'react';
import Button from '../../styled/Button';
import { AddNewIcon, AddPhotoIcon } from '../../../assets/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { useXmppClient } from '../../../context/xmppProvider';
import {
  CloseButton,
  GroupContainer,
  ModalBackground,
  ModalContainer,
  ModalTitle,
} from '../styledModalComponents';
import { setCurrentRoom } from '../../../roomStore/roomsSlice';
import InputWithLabel from '../../styled/StyledInput';

const NewChatModal: React.FC = () => {
  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

  const dispatch = useDispatch();
  const { client } = useXmppClient();

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [roomName, setRoomName] = useState<string>('');
  const [roomDescription, setRoomDescription] = useState<string>('');
  const [errors, setErrors] = useState({ name: '', description: '' });

  const isValid = useMemo(
    () => roomName.length >= 3 && roomDescription.length >= 5,
    [roomName, roomDescription]
  );

  const validateRoomName = (name: string) => {
    if (name.trim().length < 3) {
      return 'Room name must be at least 3 characters.';
    }
    return '';
  };

  const validateRoomDescription = (description: string) => {
    if (description.trim().length < 5) {
      return 'Room description must be at least 5 characters.';
    }
    return '';
  };

  const handleRoomNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('adsasd');
    const name = e.target.value;
    setRoomName(name);
    setErrors((prevErrors) => ({
      ...prevErrors,
      name: validateRoomName(name),
    }));
  };

  const handleRoomDescriptionChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const description = e.target.value;
    setRoomDescription(description);
    setErrors((prevErrors) => ({
      ...prevErrors,
      description: validateRoomDescription(description),
    }));
  };

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const handleCreateRoom = async () => {
    if (isValid) {
      const newChatJid = await client.createRoomStanza(
        roomName,
        roomDescription
      );
      await client.getRoomsStanza();
      dispatch(setCurrentRoom({ roomJID: newChatJid }));
      setIsModalOpen(false);
      setErrors({ name: '', description: '' });
      setRoomName('');
      setRoomDescription('');
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
              style={{
                flexDirection: 'column',
                position: 'relative',
                boxSizing: 'border-box',
                width: '100%',
              }}
            >
              <InputWithLabel
                style={{ flex: 1 }}
                id="roomName"
                value={roomName}
                onChange={handleRoomNameChange}
                placeholder="Enter Room Name"
                helperText={errors.name}
                error={!!errors.name}
              />
              <InputWithLabel
                style={{ flex: 1 }}
                id="roomDescription"
                value={roomDescription}
                onChange={handleRoomDescriptionChange}
                placeholder="Enter Description"
                helperText={errors.description}
                error={!!errors.description}
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
                disabled={!isValid}
              />
            </GroupContainer>
          </ModalContainer>
        </ModalBackground>
      )}
    </>
  );
};

export default NewChatModal;
