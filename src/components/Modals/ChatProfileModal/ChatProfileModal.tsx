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
} from '../styledModalComponents';
import ModalHeaderComponent from '../ModalHeaderComponent';
import { ProfileImagePlaceholder } from '../../MainComponents/ProfileImagePlaceholder';
import { useRoomPresence } from '../../../hooks/useRoomPresence';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { RootState, getActiveRoom } from '../../../roomStore';
import { SearchInput } from '../../InputComponents/Search';
import { SearchIcon } from '../../../assets/icons';
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
import { useMyFiles } from '../../../hooks/useMyFiles';
import FilesList from '../../Files/FilesList';
import { ApiFile } from '../../../types/types';
import { withFileToken } from '../../../helpers/secureFileUrl';
import ChatProfileMemberRow from './ChatProfileMemberRow';

interface ChatProfileModalProps {
  handleCloseModal: any;
}

// Windowed rendering, same idea as MessageList.tsx's RENDER_WINDOW_INITIAL/
// STEP: a room can have ~3,500 members, and mounting every row as a full DOM
// subtree (avatar + name + online dot + role chip) at once is what made this
// modal lag. Only the first MEMBER_RENDER_WINDOW_INITIAL rows are mounted;
// "Show more" grows the window by MEMBER_RENDER_WINDOW_STEP at a time.
const MEMBER_RENDER_WINDOW_INITIAL = 150;
const MEMBER_RENDER_WINDOW_STEP = 150;

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
        styles: { color: 'var(--ethora-color-danger, #D92D20)' },
      },
    ],
    [t]
  );

  const [filesExpanded, setFilesExpanded] = useState<boolean>(false);
  const [visibleMemberCount, setVisibleMemberCount] = useState<number>(
    MEMBER_RENDER_WINDOW_INITIAL
  );
  const [memberQuery, setMemberQuery] = useState<string>('');

  const dispatch = useDispatch();
  const store = useStore<RootState>();

  const { client } = useXmppClient();
  const { user: stateUser, config } = useChatSettingState();
  // config.disableRoomConfig turns the chat-details panel read-only: no
  // avatar upload/remove, no "Delete chat", no add-members, no per-member
  // moderator actions. Everything informational stays visible.
  const roomConfigDisabled = config?.disableRoomConfig === true;
  const activeRoom = useSelector((state: RootState) => getActiveRoom(state));
  const onlineUsers = useRoomPresence(activeRoom?.jid);
  // Secure room avatars need the viewer's own `?ft=` token appended at
  // render time - see appendFileToken in helpers/secureFileUrl.
  const fileToken = useSelector(
    (state: RootState) => state.chatSettingStore.user?.fileToken || ''
  );

  // `onlineUsers` is an array (see useRoomPresence). Checking membership with
  // .includes() inside a .map() over up to ~3,500 members made the online-dot
  // lookup O(n*m) for the whole list; a Set gives each row an O(1) check.
  const onlineUsersSet = useMemo(() => new Set(onlineUsers), [onlineUsers]);

  // XMPP affiliation responses populate activeRoom.members with bare
  // xmppUsername-only entries (firstName/lastName/profileImage are blank).
  // Enriching each member with the real name/avatar from the app-wide
  // `usersSet` dictionary now happens INSIDE ChatProfileMemberRow (each row
  // selects only its own usersSet entry) instead of here: this modal used to
  // subscribe to the whole usersSet map and remap all ~3,500 members on every
  // insertUsers dispatch anywhere in the app (live stanzas, roster sync,
  // etc.), which re-rendered the entire modal on every such dispatch even
  // when none of it touched this room. Not depending on usersSet at all here
  // means this modal only re-renders when the room's own member list changes.
  const enrichedMembers = useMemo(() => {
    return Array.isArray(activeRoom?.members) ? activeRoom.members : [];
  }, [activeRoom?.members]);

  // The search box has to match against the ENRICHED name (a bare XMPP
  // affiliation entry usually has empty firstName/lastName - see the note
  // above), so it needs the same usersSet lookup ChatProfileMemberRow does.
  // Reading it here via useSelector would put the whole-map subscription
  // right back on the modal (the exact bug this file was just fixed for).
  // Instead, pull a ONE-TIME snapshot from the store with `store.getState()`
  // inside this useMemo: it only runs when the query text or the member
  // list itself changes, never on an unrelated insertUsers dispatch, so a
  // room the user isn't actively searching stays fully decoupled from the
  // app-wide user dictionary.
  const filteredMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return enrichedMembers;
    const usersSet = store.getState().rooms.usersSet;
    return enrichedMembers.filter((m) => {
      const key = String(m?.xmppUsername || '');
      const localKey = key.split('@')[0];
      const entry = (usersSet as any)?.[key] || (usersSet as any)?.[localKey];
      const firstName = m.firstName || entry?.firstName || '';
      const lastName = m.lastName || entry?.lastName || '';
      return `${firstName} ${lastName}`.toLowerCase().includes(query);
    });
  }, [enrichedMembers, memberQuery, store]);

  const visibleMembers = useMemo(
    () => filteredMembers.slice(0, visibleMemberCount),
    [filteredMembers, visibleMemberCount]
  );
  const hasMoreMembers = visibleMemberCount < filteredMembers.length;

  const handleMemberQueryChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ): void => {
    setMemberQuery(e.target.value);
    // A new query changes which/how-many members match, so the old
    // window position no longer means anything - start from the top of
    // the (new) filtered list, same as MessageList resets its window on
    // a fresh search.
    setVisibleMemberCount(MEMBER_RENDER_WINDOW_INITIAL);
  };

  // Files uploaded through this room, filtered client-side (the /v2/files
  // list endpoint has no server-side room filter) by matching the room's
  // local JID part - the same value handleDeleteUser already sends as
  // `roomId` when calling /v1/chats/users-access.
  const roomLocalName = activeRoom?.jid
    ? activeRoom.jid.split('@')[0]
    : undefined;
  const {
    items: roomFiles,
    loading: filesLoading,
    error: filesError,
    remove: removeFile,
  } = useMyFiles({ roomName: roomLocalName });
  const visibleRoomFiles = filesExpanded ? roomFiles : roomFiles.slice(0, 6);

  const handleFilePreview = (file: ApiFile) => {
    const url = withFileToken(file.location);
    if (url && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleFileDownload = (file: ApiFile) => {
    const url = withFileToken(file.location);
    if (!url || typeof document === 'undefined') return;
    const link = document.createElement('a');
    link.href = url;
    link.download = file.originalname || 'file';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleFileDelete = (file: ApiFile) => {
    removeFile(file._id).catch(() => {
      // Error surfaced via the hook's `error` state; nothing else to do here.
    });
  };

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
              <Button
                EndIcon={<QrIcon />}
                onClick={() => setVisible(true)}
                aria-label={t('action.showQr')}
              />
            )}
            {activeRoom.role === 'moderator' &&
              activeRoom.type !== 'private' &&
              !roomConfigDisabled &&
              !config?.disableChatInfo?.disableChatHeaderMenu && (
                <DropdownMenu
                  position="left"
                  options={chatMenuOptions}
                  openButton={
                    <Button
                      style={{ padding: 8, maxHeight: '40px' }}
                      EndIcon={<MoreIcon />}
                      unstyled
                      aria-label={t('action.moreOptions')}
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
          upload={
            roomConfigDisabled
              ? undefined
              : {
                  onUpload,
                  active: activeRoom?.role !== 'participant' ? true : false,
                }
          }
          remove={
            roomConfigDisabled ? undefined : { enabled: true, onRemoveClick }
          }
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
        {activeRoom.role === 'moderator' &&
          activeRoom.type === 'group' &&
          !roomConfigDisabled && (
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
            {enrichedMembers.length > 0 && (
              <div style={{ padding: '4px 0 12px' }}>
                <SearchInput
                  icon={<SearchIcon height={'20px'} />}
                  value={memberQuery}
                  onChange={handleMemberQueryChange}
                  placeholder={t('modal.chatProfile.searchMembers')}
                  aria-label={t('modal.chatProfile.searchMembers')}
                />
              </div>
            )}
            {loading ? (
              <Loader />
            ) : (
              <>
                {visibleMembers.map((user, index) => (
                  <ChatProfileMemberRow
                    key={user.xmppUsername}
                    member={user}
                    isLast={
                      index === visibleMembers.length - 1 && !hasMoreMembers
                    }
                    disableClick={!!config?.disableChatInfo?.disableMembers}
                    online={onlineUsersSet.has(user.xmppUsername)}
                    showMenu={
                      stateUser.xmppUsername !== user.xmppUsername &&
                      activeRoom.role === 'moderator' &&
                      activeRoom.type !== 'private' &&
                      // config.disableRoomConfig makes the panel read-only, so
                      // the per-member moderator actions (appoint admin, remove
                      // member) go with it.
                      !roomConfigDisabled
                    }
                    menuOptions={menuOptions(user.xmppUsername)}
                    moreOptionsLabel={t('action.moreOptions')}
                    onAvatarClick={handleUserAvatarClick}
                  />
                ))}
                {hasMoreMembers && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      padding: '12px 0',
                      cursor: 'pointer',
                    }}
                    onClick={() =>
                      setVisibleMemberCount(
                        (count) => count + MEMBER_RENDER_WINDOW_STEP
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setVisibleMemberCount(
                          (count) => count + MEMBER_RENDER_WINDOW_STEP
                        );
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <Label
                      style={{
                        color: 'var(--ethora-color-primary, #0052CD)',
                        fontSize: '13px',
                      }}
                    >
                      {t('modal.chatProfile.membersShowMore', {
                        count: filteredMembers.length - visibleMemberCount,
                      })}
                    </Label>
                  </div>
                )}
              </>
            )}
          </BorderedContainer>
        )}
        <BorderedContainer style={{ padding: '8px 16px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
            }}
            onClick={() => setFilesExpanded((prev) => !prev)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setFilesExpanded((prev) => !prev);
              }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={filesExpanded}
          >
            <LabelData>{t('modal.chatProfile.filesTitle')}</LabelData>
            {roomFiles.length > 6 && (
              <Label style={{ color: 'var(--ethora-color-primary, #0052CD)', fontSize: '13px' }}>
                {t('modal.chatProfile.filesShowAll')}
              </Label>
            )}
          </div>
          {filesLoading && roomFiles.length === 0 ? (
            <Loader />
          ) : filesError && roomFiles.length === 0 ? (
            <Label>{t('files.error.title')}</Label>
          ) : roomFiles.length === 0 ? (
            <Label>{t('modal.chatProfile.filesEmpty')}</Label>
          ) : (
            <FilesList
              items={visibleRoomFiles}
              fileToken={fileToken}
              onPreview={handleFilePreview}
              onDownload={handleFileDownload}
              onDelete={handleFileDelete}
              compact
            />
          )}
        </BorderedContainer>
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
