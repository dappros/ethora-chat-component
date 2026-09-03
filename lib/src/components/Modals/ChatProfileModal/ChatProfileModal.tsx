import React, { useMemo, useState } from 'react';
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
} from '../styledModalComponents';
import ModalHeaderComponent from '../ModalHeaderComponent';
import { ProfileImagePlaceholder } from '../../MainComponents/ProfileImagePlaceholder';
import { useRoomPresence } from '../../../hooks/useRoomPresence';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, getActiveRoom } from '../../../roomStore';
import { uploadFile } from '../../../networking/api-requests/auth.api';
import { appendFileToken } from '../../../helpers/secureFileUrl';
import { useXmppClient } from '../../../context/xmppProvider';
import { updateRoom } from '../../../roomStore/roomsSlice';
import Loader from '../../styled/Loader';
import Button from '../../styled/Button';
import { DeleteIcon, MoreIcon, QrIcon } from '../../../assets/icons';
import OperationalModal from '../../OperationalModal/OperationalModal';
import { RoomMember } from '../../../types/types';
import {
  setActiveModal,
  setSelectedUser,
} from '../../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';
import AddMembersModal from '../AddMembersModal/AddMembersModal';
import { deleteRoomMember } from '../../../networking/api-requests/rooms.api';
import DropdownMenu from '../../DropdownMenu/DropdownMenu';
import DeleteChatModal from './DeleteChatModal';
import { useChatSettingState } from '../../../hooks/useChatSettingState';
import SelectUsersModal from '../SelectUsersModal/SelectUsersModal';
import { useToast } from '../../../context/ToastContext';
import { ethoraLogger } from '../../../helpers/ethoraLogger';
import { useT } from '../../../i18n/useT';

interface ChatProfileModalProps {
  handleCloseModal: any;
}

const ChatProfileModal: React.FC<ChatProfileModalProps> = ({
  handleCloseModal,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [visible, setVisible] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { showToast } = useToast();
  const t = useT();

  const chatMenuOptions = useMemo(
    () => [
      {
        label: t('action.deleteChat'),
        icon: <DeleteIcon />,
        onClick: () => {
          setIsModalOpen(true);
        },
        styles: { color: 'red' },
      },
    ],
    [t]
  );

  const dispatch = useDispatch();

  const { client } = useXmppClient();
  const { user: stateUser, config } = useChatSettingState();
  const activeRoom = useSelector((state: RootState) => getActiveRoom(state));
  const onlineUsers = useRoomPresence(activeRoom?.jid);
  const usersSet = useSelector((state: RootState) => state.rooms.usersSet);
  // Secure room avatars need the viewer's own `?ft=` token appended at
  // render time - see appendFileToken in helpers/secureFileUrl.
  const fileToken = useSelector(
    (state: RootState) => state.chatSettingStore.user?.fileToken || ''
  );

  // XMPP affiliation responses populate activeRoom.members with bare
  // xmppUsername-only entries (firstName/lastName/profileImage are blank). The
  // user dictionary `usersSet` is populated separately from <data> stamps on
  // incoming messages and from API enrichment calls, so it carries the actual
  // names + avatars. Merge them at render time so the chat-details members list
  // doesn't fall back to initials for participants who already have an avatar
  // visible in inline message bubbles.
  const enrichedMembers = useMemo(() => {
    const members = Array.isArray(activeRoom?.members) ? activeRoom.members : [];
    return members.map((m) => {
      const key = String(m?.xmppUsername || '');
      const localKey = key.split('@')[0];
      const enriched = (usersSet as any)?.[key] || (usersSet as any)?.[localKey];
      if (!enriched) return m;
      return {
        ...m,
        firstName: m.firstName || enriched.firstName || '',
        lastName: m.lastName || enriched.lastName || '',
        profileImage: (m as any).profileImage || enriched.profileImage || (enriched as any).photoURL || '',
      };
    });
  }, [activeRoom?.members, usersSet]);

  const onUpload = async (file: File) => {
    try {
      let mediaData: FormData | null = new FormData();
      mediaData.append('files', file);

      const uploadResult = await uploadFile(mediaData, activeRoom.jid);

      const location = uploadResult?.data?.results?.[0]?.location;

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

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteRoomMember({
        roomId: activeRoom.jid.split('@')[0],
        members: [userId],
      });

      dispatch(
        updateRoom({
          jid: activeRoom.jid,
          updates: {
            members: (Array.isArray(activeRoom.members) ? activeRoom.members : []).filter(
              (user) => user.xmppUsername !== userId
            ),
          },
        })
      );

      showToast({
        id: Date.now().toString(),
        title: t('toast.success'),
        message: t('toast.userRemovedFromRoom', { userId }),
        type: 'success',
      });
    } catch (error) {
      console.error('Failed to delete user:', error);
      showToast({
        id: Date.now().toString(),
        title: t('toast.error'),
        message: t('toast.failedToDeleteUser'),
        type: 'error',
      });
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

  const menuOptions = useMemo(
    () => (userId: string) => [
      {
        label: t('action.appointAsAdmin'),
        icon: null,
        onClick: () => {
          dispatch(setActiveModal(MODAL_TYPES.PROFILE));
          ethoraLogger.log('Profile clicked');
        },
      },
      {
        label: t('action.delete'),
        icon: null,
        onClick: (e: any) => {
          e?.preventDefault();
          handleDeleteUser(userId);
        },
      },
    ],
    [t]
  );

  if (!activeRoom) {
    dispatch(setActiveModal());
    return null;
  }

  return (
    <ModalContainerFullScreen style={{ position: 'relative' }}>
      <ModalHeaderComponent
        handleCloseModal={handleCloseModal}
        headerTitle={t('modal.chatProfile.title')}
        rightMenu={
          <>
            {activeRoom?.type === 'public' && (
              <Button EndIcon={<QrIcon />} onClick={() => setVisible(true)} />
            )}
            {activeRoom.role === 'moderator' &&
              activeRoom.type !== 'private' &&
              !config?.disableChatInfo?.disableChatHeaderMenu && (
                <DropdownMenu
                  position="left"
                  options={chatMenuOptions}
                  openButton={
                    <Button
                      style={{ padding: 8, maxHeight: '40px' }}
                      EndIcon={<MoreIcon />}
                      unstyled
                    />
                  }
                />
              )}
          </>
        }
      />
      <CenterContainer>
        <ProfileImagePlaceholder
          name={activeRoom.name}
          icon={appendFileToken(activeRoom.icon, fileToken)}
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
            {(() => {
              const displayCount =
                Array.isArray(activeRoom.members) && activeRoom.members.length > 0
                  ? activeRoom.members.length
                  : typeof activeRoom.usersCnt === 'number' &&
                      activeRoom.usersCnt > 0
                    ? activeRoom.usersCnt
                    : 0;
              return displayCount === 1
                ? t('modal.chatProfile.memberCountSingular', { count: displayCount })
                : t('modal.chatProfile.memberCountPlural', { count: displayCount });
            })()}
          </UserStatus>
        </UserInfo>
        {activeRoom.role === 'moderator' && activeRoom.type === 'group' && (
          <>
            {/* <AddMembersModal /> */}
            <SelectUsersModal />
          </>
        )}
        {!config?.disableChatInfo?.disableDescription && (
          <BorderedContainer>
            <LabelData>{t('modal.chatProfile.description')}</LabelData>
            <Label>{activeRoom?.description}</Label>
          </BorderedContainer>
        )}
        {!config?.disableChatInfo?.disableType && (
          <BorderedContainer>
            <LabelData>{t('modal.chatProfile.chatType')}</LabelData>
            <Label>{activeRoom.type}</Label>
          </BorderedContainer>
        )}
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
        {!config?.disableChatInfo?.hideMembers && (
          <BorderedContainer style={{ padding: '8px 16px' }}>
            {loading ? (
              <Loader />
            ) : (
              enrichedMembers.map((user, index) => (
                <div
                  key={user.xmppUsername}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'start',
                    boxSizing: 'border-box',
                  }}
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
                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        cursor: config?.disableChatInfo?.disableMembers
                          ? 'default'
                          : 'pointer',
                      }}
                      onClick={
                        config?.disableChatInfo?.disableMembers
                          ? undefined
                          : () => handleUserAvatarClick(user)
                      }
                    >
                      <ProfileImagePlaceholder
                        name={`${user.firstName} ${user.lastName}`}
                        icon={(user as any).profileImage || (user as any).photoURL}
                        size={40}
                        online={onlineUsers.includes(user.xmppUsername)}
                      />
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          alignItems: 'start',
                          justifyContent: 'center',
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
                            user.ban_status !== 'banned'
                              ? '#F3F6FC'
                              : '#FFEBEE',
                          color:
                            user.ban_status !== 'banned'
                              ? '#0052CD'
                              : '#F44336',
                          padding: '5px 8px',
                          borderRadius: '16px',
                          fontSize: '12px',
                        }}
                      >
                        {user.role}
                      </div>
                    )}
                    {stateUser.xmppUsername !== user.xmppUsername &&
                      activeRoom.role === 'moderator' &&
                      activeRoom.type !== 'private' && (
                        <DropdownMenu
                          options={menuOptions(user.xmppUsername)}
                          openButton={
                            <Button
                              onClick={(e) => {
                                e.preventDefault();
                              }}
                            >
                              {t('action.moreOptions')}
                            </Button>
                          }
                          onClose={() => ethoraLogger.log('Dropdown closed')}
                        />
                      )}
                  </div>
                  {index < enrichedMembers.length - 1 && <Divider />}
                </div>
              ))
            )}
          </BorderedContainer>
        )}
      </CenterContainer>
      <OperationalModal
        isVisible={visible}
        setVisible={setVisible}
        chatJid={activeRoom.jid}
      />
      <DeleteChatModal
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
      />
    </ModalContainerFullScreen>
  );
};

export default ChatProfileModal;
