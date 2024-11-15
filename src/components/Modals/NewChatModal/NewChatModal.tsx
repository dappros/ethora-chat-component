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

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const handleCreateRoom = async () => {
    const newChatJid = await client.createRoomStanza(roomName, roomDescription);
    await client.getRooms();
    dispatch(setCurrentRoom({ roomJID: newChatJid }));
    setIsModalOpen(false);
  };

  // const onUpload = async (file: File) => {
  //   try {
  //     let mediaData: FormData | null = new FormData();
  //     mediaData.append('files', file);

  //     const uploadResult = await uploadFile(mediaData);

  //     const location = uploadResult?.data?.results?.[0]?.location;
  //     if (!location) {
  //       throw new Error('No location found in upload result.');
  //     }

  //     client.setRoomImageStanza(activeRoom.jid, location, 'icon', 'none');
  //     dispatch(
  //       updateRoom({ jid: activeRoom.jid, updates: { icon: location } })
  //     );
  //   } catch (error) {
  //     console.error('File upload failed or location is missing:', error);
  //   }
  // };

  // const onRemoveClick = async () => {
  //   client.setRoomImageStanza(activeRoom.jid, null, 'icon', 'none');
  //   dispatch(updateRoom({ jid: activeRoom.jid, updates: { icon: null } }));
  // };

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
