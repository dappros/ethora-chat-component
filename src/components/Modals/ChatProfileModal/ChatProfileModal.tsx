import React, { useEffect, useState } from 'react';
import {
  CenterContainer,
  UserInfo,
  UserName,
  UserStatus,
  ModalContainerFullScreen,
  Label,
  BorderedContainer,
  LabelData,
  Divider,
  ActionButton,
} from '../styledModalComponents';
import ModalHeaderComponent from '../ModalHeaderComponent';
import { ProfileImagePlaceholder } from '../../MainComponents/ProfileImagePlaceholder';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, getActiveRoom } from '../../../roomStore';
import { uploadFile } from '../../../networking/api-requests/auth.api';
import { useXmppClient } from '../../../context/xmppProvider';
import { updateRoom } from '../../../roomStore/roomsSlice';
import Loader from '../../styled/Loader';
import Button from '../../styled/Button';
import { MoreIcon, QrIcon } from '../../../assets/icons';
import OperationalModal from '../../OperationalModal/OperationalModal';
import Switch from '../../MainComponents/Switch';
import { IUser, RoomMember } from '../../../types/types';
import {
  setActiveModal,
  setSelectedUser,
} from '../../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';
import AddMembersModal from '../AddMembersModal/AddMembersModal';

interface ChatProfileModalProps {
  handleCloseModal: any;
}

const ChatProfileModal: React.FC<ChatProfileModalProps> = ({
  handleCloseModal,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [visible, setVisible] = useState<boolean>(false);

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
        console.log('No location found in upload result.');
      }

      if (location) {
        client.setRoomImageStanza(activeRoom.jid, location, 'icon', 'none');
        dispatch(
          updateRoom({ jid: activeRoom.jid, updates: { icon: location } })
        );
      }
    } catch (error) {
      console.error('File upload failed or location is missing:', error);
    }
  };

  const onRemoveClick = async () => {
    client.setRoomImageStanza(activeRoom.jid, null, 'icon', 'none');
    dispatch(updateRoom({ jid: activeRoom.jid, updates: { icon: null } }));
  };

  const handleUserAvatarClick = (user: RoomMember): void => {
    dispatch(setActiveModal(MODAL_TYPES.PROFILE));
    dispatch(
      setSelectedUser({
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        userJID: user?.xmppUsername,
      })
    );
  };

  if (!activeRoom) {
    dispatch(setActiveModal());
    return null;
  }

  return (
    <ModalContainerFullScreen style={{ position: 'relative' }}>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={'Chat Profile'}
        rightMenu={
          <>
            {activeRoom?.type === 'public' && (
              <Button EndIcon={<QrIcon />} onClick={() => setVisible(true)} />
            )}
            {/* <Button EndIcon={<MoreIcon />} /> */}
          </>
        }
      />
      <CenterContainer>
        <ProfileImagePlaceholder
          name={activeRoom.name}
          icon={activeRoom.icon}
          upload={{
            onUpload,
            active: activeRoom?.role !== 'participant' ? true : false,
          }}
          remove={{ enabled: true, onRemoveClick }}
          role={activeRoom?.role}
          size={128}
        />
        <UserInfo>
          <UserName>{activeRoom.name}</UserName>
          <UserStatus>
            {activeRoom.usersCnt}{' '}
            {activeRoom.usersCnt > 1 ? 'members' : 'member'}
          </UserStatus>
        </UserInfo>
        {activeRoom.role === 'moderator' && <AddMembersModal />}
        <BorderedContainer>
          <LabelData>Description</LabelData>
          <Label>Chat's Description</Label>
        </BorderedContainer>
        {/* <BorderedContainer
          style={{
            justifyContent: 'space-between',
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Label>Notifications</Label>
          <Label>
            <Switch
              onToggle={function (isOn: boolean): void {
                throw new Error('Function not implemented.');
              }}
              bgColor={config?.colors?.primary}
            />
          </Label>
        </BorderedContainer> */}
        <BorderedContainer style={{ padding: '8px 16px' }}>
          {loading ? (
            <Loader />
          ) : (
            activeRoom?.members?.map((user, index) => (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'start',
                  boxSizing: 'border-box',
                }}
                onClick={() => handleUserAvatarClick(user)}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 0px',
                    alignItems: 'center',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <ProfileImagePlaceholder
                      name={`${user.firstName} ${user.lastName}`}
                      size={40}
                    />
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        alignItems: 'start',
                      }}
                    >
                      <Label style={{ fontSize: '16px', fontWeight: 600 }}>
                        {user.firstName} {user.lastName}
                      </Label>
                      {user.last_active && (
                        <LabelData>
                          {new Date(user.last_active * 1000).toLocaleString()}
                        </LabelData>
                      )}
                    </div>
                  </div>
                  {user.role && user.role !== 'none' && (
                    <div
                      style={{
                        backgroundColor:
                          user.ban_status !== 'banned' ? '#F3F6FC' : '#FFEBEE',
                        color:
                          user.ban_status !== 'banned' ? '#0052CD' : '#F44336',
                        padding: '5px 8px',
                        borderRadius: '16px',
                        fontSize: '12px',
                      }}
                    >
                      {user.role}
                    </div>
                  )}
                </div>
                {index < activeRoom?.members.length - 1 && <Divider />}
              </div>
            ))
          )}
        </BorderedContainer>
      </CenterContainer>
      <OperationalModal
        isVisible={visible}
        setVisible={setVisible}
        chatJid={activeRoom.jid}
      />
    </ModalContainerFullScreen>
  );
};

export default ChatProfileModal;
