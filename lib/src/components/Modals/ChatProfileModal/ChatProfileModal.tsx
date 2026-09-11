import React, { useMemo, useState } from 'react';
import SideDrawer, {
  DrawerCard,
  DrawerCardBody,
  DrawerHint,
  DrawerLabel,
  DrawerRowDivider,
  DrawerSection,
  DrawerSectionTitle,
  SectionHeaderRow,
  ShowMoreButton,
} from '../SideDrawer/SideDrawer';
import {
  ProfileHero,
  ProfileHeroName,
  ProfileHeroSubtitle,
} from '../SideDrawer/DrawerProfileParts';
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
import Switch from '../../MainComponents/Switch';
import { DeleteIcon, MoreIcon, QrIcon } from '../../../assets/icons';
import { useRoomMute } from '../../../hooks/useRoomMute';
import OperationalModal from '../../OperationalModal/OperationalModal';
import { RoomMember } from '../../../types/types';
import {
  setActiveModal,
  setSelectedUser,
} from '../../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../../helpers/constants/MODAL_TYPES';
import { deleteRoomMember } from '../../../networking/api-requests/rooms.api';
import DropdownMenu from '../../DropdownMenu/DropdownMenu';
import DeleteChatModal from './DeleteChatModal';
import { useChatSettingState } from '../../../hooks/useChatSettingState';
import SelectUsersModal from '../SelectUsersModal/SelectUsersModal';
import { useToast } from '../../../context/ToastContext';
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
  const activeRoom = useSelector((state: RootState) => getActiveRoom(state));
  const {
    muted: isRoomMuted,
    isSupported: isMuteSupported,
    setMuted: setRoomMutedState,
  } = useRoomMute(activeRoom?.jid);
  // Same gate as the chat header's room menu: only show the control once
  // the backend has actually reported a `muted` value for this room, and
  // let a host hide it outright via config.disableRoomMute.
  const showMuteToggle = isMuteSupported && !config?.disableRoomMute;
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
            members: (Array.isArray(activeRoom.members)
              ? activeRoom.members
              : []
            ).filter((user) => user.xmppUsername !== userId),
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

  // config.disableRoomConfig turns the chat-details panel read-only: no
  // avatar upload or removal, no room menu, no add-members, and no
  // per-member moderator actions. Read-only details still render.
  const roomConfigDisabled = config?.disableRoomConfig === true;

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

  // "Appoint as admin" used to sit at the top of this menu, but it never
  // appointed anyone: it opened the member's profile and logged a line.
  // There is no affiliation-change call behind it anywhere in the codebase,
  // so it is gone rather than shipped as a button that pretends to work.
  const menuOptions = useMemo(
    () => (userId: string) => [
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

  const memberCountLabel = (() => {
    const displayCount =
      Array.isArray(activeRoom.members) && activeRoom.members.length > 0
        ? activeRoom.members.length
        : typeof activeRoom.usersCnt === 'number' && activeRoom.usersCnt > 0
          ? activeRoom.usersCnt
          : 0;
    return displayCount === 1
      ? t('modal.chatProfile.memberCountSingular', { count: displayCount })
      : t('modal.chatProfile.memberCountPlural', { count: displayCount });
  })();

  const showDescription = !config?.disableChatInfo?.disableDescription;
  const showType = !config?.disableChatInfo?.disableType;

  return (
    <SideDrawer
      title={t('modal.chatProfile.title')}
      onClose={handleCloseModal}
      headerActions={
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
    >
      <ProfileHero>
        <ProfileImagePlaceholder
          name={activeRoom.name}
          icon={appendFileToken(activeRoom.icon, fileToken)}
          upload={{
            onUpload,
            active: !roomConfigDisabled && activeRoom?.role !== 'participant',
          }}
          remove={
            roomConfigDisabled ? undefined : { enabled: true, onRemoveClick }
          }
          role={activeRoom?.role}
          size={96}
        />
        <div>
          <ProfileHeroName>{activeRoom.name}</ProfileHeroName>
          <ProfileHeroSubtitle>{memberCountLabel}</ProfileHeroSubtitle>
        </div>
      </ProfileHero>

      {activeRoom.role === 'moderator' &&
        activeRoom.type === 'group' &&
        !roomConfigDisabled && <SelectUsersModal />}

      {/* Description and chat type used to be two separate bordered boxes with
          no heading between them. They are one "About" card of labelled rows
          now, so the panel reads as grouped facts rather than loose chrome. */}
      {(showDescription || showType) && (
        <DrawerSection>
          <DrawerSectionTitle>
            {t('modal.chatProfile.aboutSection')}
          </DrawerSectionTitle>
          <DrawerCard>
            {showDescription && (
              <DrawerCardBody>
                <DrawerHint>{t('modal.chatProfile.description')}</DrawerHint>
                <DrawerLabel>
                  {activeRoom?.description || t('modal.profile.noDescription')}
                </DrawerLabel>
              </DrawerCardBody>
            )}
            {showDescription && showType && <DrawerRowDivider />}
            {showType && (
              <DrawerCardBody>
                <DrawerHint>{t('modal.chatProfile.chatType')}</DrawerHint>
                <DrawerLabel>{activeRoom.type}</DrawerLabel>
              </DrawerCardBody>
            )}
          </DrawerCard>
        </DrawerSection>
      )}

      {/* Same gate as the chat header's room menu: only offered once the
          backend has actually reported a `muted` value for this room, and
          hidden outright when a host sets config.disableRoomMute. */}
      {showMuteToggle && (
        <DrawerSection>
          <DrawerSectionTitle>
            {t('modal.chatProfile.notifications')}
          </DrawerSectionTitle>
          <DrawerCard>
            <DrawerCardBody
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <DrawerLabel>
                {isRoomMuted ? t('action.unmute') : t('action.mute')}
              </DrawerLabel>
              <Switch
                checked={isRoomMuted}
                onToggle={(isOn) => {
                  void setRoomMutedState(isOn);
                }}
                bgColor={config?.colors?.primary}
              />
            </DrawerCardBody>
          </DrawerCard>
        </DrawerSection>
      )}

      {!config?.disableChatInfo?.hideMembers && (
        <DrawerSection>
          <DrawerSectionTitle>
            {t('modal.chatProfile.membersSection')}
          </DrawerSectionTitle>
          <DrawerCard>
            <DrawerCardBody>
              {enrichedMembers.length > 0 && (
                <SearchInput
                  icon={<SearchIcon height={'20px'} />}
                  value={memberQuery}
                  onChange={handleMemberQueryChange}
                  placeholder={t('modal.chatProfile.searchMembers')}
                  aria-label={t('modal.chatProfile.searchMembers')}
                />
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
                        !roomConfigDisabled
                      }
                      menuOptions={menuOptions(user.xmppUsername)}
                      moreOptionsLabel={t('action.moreOptions')}
                      onAvatarClick={handleUserAvatarClick}
                    />
                  ))}
                  {hasMoreMembers && (
                    <ShowMoreButton
                      type="button"
                      onClick={() =>
                        setVisibleMemberCount(
                          (count) => count + MEMBER_RENDER_WINDOW_STEP
                        )
                      }
                    >
                      {t('modal.chatProfile.membersShowMore', {
                        count: filteredMembers.length - visibleMemberCount,
                      })}
                    </ShowMoreButton>
                  )}
                </>
              )}
            </DrawerCardBody>
          </DrawerCard>
        </DrawerSection>
      )}

      <DrawerSection>
        <SectionHeaderRow>
          <DrawerSectionTitle>
            {t('modal.chatProfile.filesTitle')}
          </DrawerSectionTitle>
          {roomFiles.length > 6 && (
            <ShowMoreButton
              type="button"
              onClick={() => setFilesExpanded((prev) => !prev)}
              aria-expanded={filesExpanded}
            >
              {filesExpanded
                ? t('modal.chatProfile.filesShowLess')
                : t('modal.chatProfile.filesShowAll')}
            </ShowMoreButton>
          )}
        </SectionHeaderRow>
        <DrawerCard>
          <DrawerCardBody>
            {filesLoading && roomFiles.length === 0 ? (
              <Loader />
            ) : filesError && roomFiles.length === 0 ? (
              <DrawerHint>{t('files.error.title')}</DrawerHint>
            ) : roomFiles.length === 0 ? (
              <DrawerHint>{t('modal.chatProfile.filesEmpty')}</DrawerHint>
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
          </DrawerCardBody>
        </DrawerCard>
      </DrawerSection>

      <OperationalModal
        isVisible={visible}
        setVisible={setVisible}
        chatJid={activeRoom.jid}
      />
      <DeleteChatModal
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
      />
    </SideDrawer>
  );
};

export default ChatProfileModal;
