import React, { useState, useMemo } from 'react';
import Button from '../../styled/Button';
import { AddNewIcon } from '../../../assets/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { useXmppClient } from '../../../context/xmppProvider';
import { addRoom, setCurrentRoom } from '../../../roomStore/roomsSlice';
import { ApiRoom, ChatAccessOption } from '../../../types/types';
import { uploadFile } from '../../../networking/api-requests/auth.api';
import { createRoomFromApi } from '../../../helpers/createRoomFromApi';
import { postRoom } from '../../../networking/api-requests/rooms.api';
import { RoomMember } from '../../../types/types';

import ModalContent from './ModalContent';
import { ModalBackground } from '../styledModalComponents';

const NewChatModal: React.FC = () => {
  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );
  const dispatch = useDispatch();
  const { client } = useXmppClient();

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
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

  const options: ChatAccessOption[] = [
    { name: 'Public', id: 'public' },
    { name: 'Members-only', id: 'group' },
  ];

  const isValid = useMemo(() => roomName.length >= 3, [roomName]);

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => {
    setActiveTab('0');
    setIsModalOpen(false);
    setRoomName('');
    setSelectedUsers([]);
  };

  const validateRoomName = (name: string) => {
    if (name.trim().length < 3) {
      return 'Room name must be at least 3 characters.';
    }
    return '';
  };

  const handleRoomNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setRoomName(name);
    setErrors((prevErrors) => ({
      ...prevErrors,
      name: validateRoomName(name),
    }));
  };

  const handleCreateRoom = async () => {
    if (isValid) {
      let mediaData: FormData | null = new FormData();
      mediaData.append('files', profileImage);

      const uploadResult = await uploadFile(mediaData);
      const location = uploadResult?.data?.results?.[0]?.location;

      const namesArray = selectedUsers.map((user) => user.xmppUsername);
      const newChat: ApiRoom = await postRoom({
        title: roomName,
        description: roomDescription || 'No description',
        picture: location || '',
        type: chatType.id || 'public',
        members: namesArray,
      });

      // Create room
      const normalizedChat = createRoomFromApi(
        newChat,
        config?.xmppSettings?.conference,
        namesArray.length
      );
      dispatch(addRoom({ roomData: normalizedChat }));
      dispatch(setCurrentRoom({ roomJID: normalizedChat.jid }));
      client.presenceInRoomStanza(normalizedChat.jid);
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
          <ModalContent
            activeTab={activeTab}
            roomName={roomName}
            roomDescription={roomDescription}
            chatType={chatType}
            profileImage={profileImage}
            setActiveTab={setActiveTab}
            handleRoomNameChange={handleRoomNameChange}
            setRoomDescription={setRoomDescription}
            setChatType={setChatType}
            setProfileImage={setProfileImage}
            selectedUsers={selectedUsers}
            setSelectedUsers={setSelectedUsers}
            handleCreateRoom={handleCreateRoom}
            handleCloseModal={handleCloseModal}
            errors={errors}
            setErrors={setErrors}
            options={options}
          />
        </ModalBackground>
      )}
    </>
  );
};

export default NewChatModal;
