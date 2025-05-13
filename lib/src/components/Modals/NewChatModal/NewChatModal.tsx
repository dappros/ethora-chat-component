import React, { useState, useMemo } from 'react';
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
import {
  addRoomViaApi,
  setCurrentRoom,
  updateRoom,
} from '../../../roomStore/roomsSlice';
import InputWithLabel from '../../styled/StyledInput';
import { uploadFile } from '../../../networking/api-requests/auth.api';
import { ProfileImagePlaceholder } from '../../MainComponents/ProfileImagePlaceholder';
import { createRoomFromApi } from '../../../helpers/createRoomFromApi';
import { postRoom } from '../../../networking/api-requests/rooms.api';
import { ApiRoom, ChatAccessOption } from '../../../types/types';
import Select from '../../MainComponents/Select';
import { RoomMember } from '../../../types/types';
import UsersList from '../../UsersList/UsersList';
import { useToast } from '../../../context/ToastContext';
import Loader from '../../styled/Loader';
import { CHAT_TYPES } from '../../../helpers/constants/CHAT_TYPES';

const NewChatModal: React.FC = () => {
  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

  const dispatch = useDispatch();
  const { client } = useXmppClient();
  const { showToast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'0' | '1' | null>('0');

  const [roomName, setRoomName] = useState<string>('');
  const [roomDescription, setRoomDescription] = useState<string>('');
  const [chatType, setChatType] = useState<ChatAccessOption>({
    name: 'Public',
    id: 'public',
  });
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
    setActiveTab('0');
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

      dispatch(
        addRoomViaApi({
          room: normalizedChat,
          xmpp: client,
        })
      );

      dispatch(setCurrentRoom({ roomJID: normalizedChat.jid }));
    } catch (error) {
      console.error('Error handling room creation:', error);
    }
  };

  const handleCreateRoom = async () => {
    showToast({
      id: Date.now().toString(),
      title: 'Room creation',
      message: 'Room is being created...',
      type: 'info',
      duration: 3000,
    });
    setLoading(true);
    if (isValid) {
      let mediaData: FormData | null = new FormData();
      mediaData.append('files', profileImage);

      const uploadResult = await uploadFile(mediaData);

      const location = uploadResult?.data?.results?.[0]?.location;

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
      setLoading(false);
      showToast({
        id: Date.now().toString(),
        title: 'Success!',
        message: 'Room created succusfully!',
        type: 'success',
        duration: 3000,
      });
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
          {activeTab === '0' && (
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
                {/* {chatType.id === 'group' && (
                <InputWithLabel
                  style={{ flex: 1 }}
                  id="roomDescription"
                  value={roomDescription}
                  onChange={handleRoomDescriptionChange}
                  placeholder="Enter Description"
                  helperText={errors.description}
                  error={!!errors.description}
                />
              )} */}
                <Select
                  options={CHAT_TYPES}
                  placeholder={'Select your language'}
                  onSelect={(type: ChatAccessOption) => setChatType(type)}
                  accentColor={config?.colors?.primary}
                  selectedValue={chatType}
                />
              </GroupContainer>

              {chatType.id === 'group' && (
                <Button
                  onClick={() => setActiveTab('1')}
                  style={{ width: '100%' }}
                  variant="outlined"
                  unstyled
                >
                  Add users
                </Button>
              )}
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
                  text={!loading ? 'Create' : undefined}
                  style={{ width: '100%' }}
                  variant="filled"
                  disabled={!isValid || loading}
                  EndIcon={loading ? <Loader size={16} /> : undefined}
                />
              </GroupContainer>
            </ModalContainer>
          )}
          {activeTab === '1' && (
            <ModalContainer style={{ minHeight: '500px' }}>
              <CloseButton onClick={handleCloseModal} style={{ fontSize: 24 }}>
                &times;
              </CloseButton>
              <ModalTitle>Select users to add to Chat</ModalTitle>
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
              <Button
                onClick={() => setActiveTab('0')}
                style={{ width: '100%' }}
                variant="outlined"
                unstyled
              >
                Back to creation
              </Button>
            </ModalContainer>
          )}
        </ModalBackground>
      )}
    </>
  );
};

export default NewChatModal;
