import React from 'react';
import {
  CenterContainer,
  UserInfo,
  UserName,
  UserStatus,
  ModalContainerFullScreen,
  Label,
  BorderedContainer,
  LabelData,
} from '../styledModalComponents';
import ModalHeaderComponent from '../ModalHeaderComponent';
import { ChatHeaderAvatar } from '../../MainComponents/ChatHeaderAvatar';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, getActiveRoom } from '../../../roomStore';
import { uploadFile } from '../../../networking/api-requests/auth.api';
import { useXmppClient } from '../../../context/xmppProvider';
import { updateRoom } from '../../../roomStore/roomsSlice';

interface ChatProfileModalProps {
  handleCloseModal: any;
}

const ChatProfileModal: React.FC<ChatProfileModalProps> = ({
  handleCloseModal,
}) => {
  const dispatch = useDispatch();
  const { client } = useXmppClient();
  const activeRoom = useSelector((state: RootState) => getActiveRoom(state));

  const onUpload = async (file: File) => {
    try {
      let mediaData: FormData | null = new FormData();
      mediaData.append('files', file);

      const uploadResult = await uploadFile(mediaData);

      const location = uploadResult?.data?.results?.[0]?.location;
      if (!location) {
        throw new Error('No location found in upload result.');
      }

      client.setRoomImageStanza(activeRoom.jid, location, 'icon', 'none');
      dispatch(
        updateRoom({ jid: activeRoom.jid, updates: { icon: location } })
      );
    } catch (error) {
      console.error('File upload failed or location is missing:', error);
    }
  };

  const onRemoveClick = async () => {
    client.setRoomImageStanza(activeRoom.jid, null, 'icon', 'none');
    dispatch(updateRoom({ jid: activeRoom.jid, updates: { icon: null } }));
  };

  return (
    <ModalContainerFullScreen>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={'ChatProfile'}
      />
      <CenterContainer>
        <ChatHeaderAvatar
          name={activeRoom.name}
          icon={activeRoom.icon}
          upload={{
            onUpload,
            active: activeRoom?.role !== 'participant' ? true : false,
          }}
          remove={{ enabled: true, onRemoveClick }}
          role={activeRoom?.role}
        />
        <UserInfo>
          <UserName>{activeRoom.name}</UserName>
          <UserStatus>{activeRoom.usersCnt} members</UserStatus>
        </UserInfo>
        <BorderedContainer>
          <LabelData>Description</LabelData>
          <Label>Chat's Description</Label>
        </BorderedContainer>
      </CenterContainer>
    </ModalContainerFullScreen>
  );
};

export default ChatProfileModal;
