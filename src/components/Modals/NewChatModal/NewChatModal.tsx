import React, { useState, useEffect, useMemo } from 'react';
import Button from '../../styled/Button';
import { AddNewIcon, AddPhotoIcon } from '../../../assets/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { useXmppClient } from '../../../context/xmppProvider';
import {
  CloseButton,
  GroupContainer,
  Label,
  ModalBackground,
  ModalContainer,
  ModalTitle,
} from '../styledModalComponents';
import {
  addRoom,
  addRoomViaApi,
  setCurrentRoom,
  updateRoom,
  updateUsersSet,
} from '../../../roomStore/roomsSlice';
import InputWithLabel from '../../styled/StyledInput';
import { uploadFile } from '../../../networking/api-requests/auth.api';
import { ProfileImagePlaceholder } from '../../MainComponents/ProfileImagePlaceholder';
import { createRoomFromApi } from '../../../helpers/createRoomFromApi';
import {
  getRoomByName,
  getRooms,
  postRoom,
} from '../../../networking/api-requests/rooms.api';
import { ApiRoom } from '../../../types/types';
import Select from '../../MainComponents/Select';
import { RoomMember } from '../../../types/types';
import UsersList from '../../UsersList/UsersList';

const NewChatModal: React.FC = () => {
  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

  const dispatch = useDispatch();
  const { client } = useXmppClient();
  const usersSet = useSelector((state: RootState) => state.rooms.usersSet);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [roomName, setRoomName] = useState<string>('');
  const [roomDescription, setRoomDescription] = useState<string>('');
  const [chatType, setChatType] = useState<
    { name: 'Public'; id: 'public' } | { name: 'Group'; id: 'group' }
  >({ name: 'Public', id: 'public' });
  const [profileImage, setProfileImage] = useState<string | File | null>(null);
  const [errors, setErrors] = useState({ name: '', description: '' });
  const [selectedUsers, setSelectedUsers] = useState<RoomMember[]>([]);

  const isValid = useMemo(
    // () => roomName.length >= 3 && roomDescription.length >= 5,
    () => roomName.length >= 3,
    [roomName, roomDescription]
  );

  const validateRoomName = (name: string) => {
    if (name.trim().length < 3) {
      return 'Room name must be at least 3 characters.';
    }
    return '';
  };

  // const validateRoomDescription = (description: string) => {
  //   if (description.trim().length < 5) {
  //     return 'Room description must be at least 5 characters.';
  //   }
  //   return '';
  // };

  const handleRoomNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      // description: validateRoomDescription(description),
    }));
  };

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setRoomName('');
    setSelectedUsers([]);
  };

  const onUpload = async (file: File) => {
    setProfileImage(file);
  };

  const onRemoveClick = async () => {
    setProfileImage(null);
  };

  const handleRoomCreation = async (
    newChat: ApiRoom,
    usersArrayLength: number
  ) => {
    try {
      const normalizedChat = createRoomFromApi(
        newChat,
        config?.xmppSettings?.conference,
        usersArrayLength
      );

      dispatch(addRoom({ roomData: normalizedChat }));

      dispatch(setCurrentRoom({ roomJID: normalizedChat.jid }));

      client.presenceInRoomStanza(normalizedChat.jid);

      const room = await getRoomByName(normalizedChat.jid);
      dispatch(
        addRoomViaApi({
          room: createRoomFromApi(
            room,
            config?.xmppSettings?.conference,
            usersArrayLength
          ),
          xmpp: client,
        })
      );
    } catch (error) {
      console.error('Error handling room creation:', error);
    }
  };

  const handleCreateRoom = async () => {
    if (isValid) {
      let mediaData: FormData | null = new FormData();
      mediaData.append('files', profileImage);

      const uploadResult = await uploadFile(mediaData);

      const location = uploadResult?.data?.results?.[0]?.location;
      if (!location) {
        console.log('No location found in upload result.');
      }

      if (config?.newArch) {
        const namesArray = selectedUsers.map((user) => user.xmppUsername);
        const newChat: ApiRoom = await postRoom({
          title: roomName,
          description:
            roomDescription && roomDescription !== ''
              ? roomDescription
              : 'No description',
          picture: location || '',
          type: chatType.id || 'public',
          members: namesArray,
        });

        handleRoomCreation(newChat, namesArray.length);
      } else {
        const newChatJid = await client.createRoomStanza(
          roomName,
          roomDescription && roomDescription !== ''
            ? roomDescription
            : 'No description'
        );

        client.getRoomsStanza();

        dispatch(setCurrentRoom({ roomJID: newChatJid }));

        if (location) {
          client.setRoomImageStanza(newChatJid, location, 'icon', 'none');
          dispatch(
            updateRoom({ jid: newChatJid, updates: { icon: location } })
          );
        }
      }

      setIsModalOpen(false);
      setErrors({ name: '', description: '' });
      setProfileImage(null);
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
            <ProfileImagePlaceholder
              size={120}
              upload={{ active: true, onUpload }}
              remove={{ enabled: true, onRemoveClick }}
              placeholderIcon={<AddPhotoIcon />}
              icon={profileImage}
              disableOverlay={!profileImage}
              role="user"
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
              <Select
                options={[
                  { name: 'Public', id: 'public' },
                  { name: 'Group', id: 'group' },
                ]}
                placeholder={'Select your language'}
                onSelect={(type) =>
                  setChatType(
                    type as
                      | { name: 'Public'; id: 'public' }
                      | { name: 'Group'; id: 'group' }
                  )
                }
                accentColor={config?.colors?.primary}
                selectedValue={chatType}
              />
            </GroupContainer>

            <UsersList
              selectedUsers={selectedUsers}
              setSelectedUsers={setSelectedUsers}
              style={{ minHeight: '200px' }}
              headerElement={false}
            />

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
