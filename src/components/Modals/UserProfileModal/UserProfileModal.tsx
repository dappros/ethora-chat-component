import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActionButton } from '../styledModalComponents';
import SideDrawer, {
  DrawerCard,
  DrawerCardBody,
  DrawerHint,
  DrawerSection,
  DrawerSectionTitle,
} from '../SideDrawer/SideDrawer';
import {
  DrawerDescriptionText,
  ProfileHero,
  ProfileHeroName,
  ProfileActions,
} from '../SideDrawer/DrawerProfileParts';
import {
  AudioCallIcon,
  ChatIcon,
  EditIcon,
  LeaveIcon,
  MoreIcon,
  VideoCallIcon,
} from '../../../assets/icons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { ProfileImagePlaceholder } from '../../MainComponents/ProfileImagePlaceholder';
import Button from '../../styled/Button';
import DropdownMenu from '../../DropdownMenu/DropdownMenu';
import {
  setActiveModal,
  setLangSource,
  setSelectedUser,
} from '../../../roomStore/chatSettingsSlice';
import {
  addRoom,
  addRoomViaApi,
  setCurrentRoom,
} from '../../../roomStore/roomsSlice';
import EditUserModal, { EditUserModalHandle } from './EditUserModal';
import { walletToUsername } from '../../../helpers/walletUsername';
import { useXmppClient } from '../../../context/xmppProvider';
import Loader from '../../styled/Loader';
import { ApiRoom, Iso639_1Codes } from '../../../types/types';
import Select from '../../MainComponents/Select';
import { handleCopyClick } from '../../../helpers/handleCopyClick';
import {
  getRoomByName,
  postPrivateRoom,
} from '../../../networking/api-requests/rooms.api';
import { LANGUAGE_OPTIONS } from '../../../helpers/constants/LANGUAGE_OPTIONS';
import { useToast } from '../../../context/ToastContext';
import { createRoomFromApi } from '../../../helpers/createRoomFromApi';
import { createChatCall } from '../../../networking/api-requests/rooms.api';
import { setCallError, startOutgoingCall } from '../../../roomStore/callSlice';
import { sendCallInviteSignal } from '../../../networking/callTokenStanza';
import { useUsersSet } from '../../../hooks/useRoomState';
import { useAppDispatch } from '../../../hooks/hooks';
import { logoutService } from '../../../hooks/useLogout';
import { useT } from '../../../i18n/useT';

interface UserProfileModalProps {
  handleCloseModal: any;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  handleCloseModal,
}) => {
  const dispatch = useAppDispatch();

  const { client } = useXmppClient();
  const usersSet = useUsersSet();
  const { showToast } = useToast();
  const t = useT();

  const { config, user, selectedUser, langSource } = useSelector(
    (state: RootState) => state.chatSettingStore
  );
  const callPhase = useSelector((state: RootState) => state.call.phase);

  const [isEditing, setIsEditing] = useState<boolean>(false);
  // Lets the drawer's own header Save button trigger EditUserModal's save
  // (see EditUserModalHandle) instead of EditUserModal rendering a second,
  // redundant header of its own below the drawer's "<- Profile" bar.
  const editHandleRef = useRef<EditUserModalHandle | null>(null);

  // Calling from the profile creates the 1:1 private room then dials it. Gate on
  // the same prerequisites as the chat header (the target room is private).
  const videoCallsConfig = config?.videoCalls;
  const canCall =
    videoCallsConfig?.enabled === true &&
    Boolean(videoCallsConfig?.livekitUrl?.trim()) &&
    (videoCallsConfig?.allowedRoomTypes || ['private']).includes('private');
  const isAudioCallsEnabled =
    canCall && videoCallsConfig?.enableAudioCalls === true;
  const isCallBusy = callPhase !== 'idle';

  const handleBackClick = useCallback(() => {
    dispatch(setSelectedUser());
    handleCloseModal();
  }, []);

  const handleLogout = useCallback(() => {
    void logoutService.performLogout();
  }, []);

  const menuOptions = useMemo(
    () => [
      {
        label: t('action.logOut'),
        icon: <LeaveIcon />,
        onClick: () => {
          handleLogout();
        },
        styles: { color: 'var(--ethora-color-danger, #D92D20)' },
      },
    ],
    [handleLogout, t]
  );

  const handleSelect = (selected: { name: string; id: Iso639_1Codes }) => {
    dispatch(setLangSource(selected.id));
  };

  const EditClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleRoomCreation = async (
    newChat: ApiRoom,
    usersArrayLength: number
  ): Promise<{ jid: string } | null> => {
    try {
      // Guard against the createRoomFromApi try/catch returning null for malformed
      // payloads. Without this we'd dispatch a null into the store and crash on
      // setCurrentRoom trying to read .jid.
      const normalizedChat = createRoomFromApi(
        newChat,
        config?.xmppSettings?.conference,
        usersArrayLength
      );
      if (!normalizedChat || !normalizedChat.jid) {
        console.error(
          'handleRoomCreation: failed to normalize new private room',
          newChat
        );
        showToast({
          id: Date.now().toString(),
          title: t('toast.error'),
          message: t('toast.couldNotOpenPrivateChat'),
          type: 'error',
          duration: 4000,
        });
        return null;
      }

      dispatch(
        addRoomViaApi({
          room: normalizedChat,
          xmpp: client,
        })
      );

      // Explicit MUC join + history pull. The addRoomViaApi thunk used to do this
      // itself but was stripped in commit 55e9758 ("optimize message synchronization")
      // on the assumption that room bootstrap is always handled by initialization
      // flows - true for startup room-list sync, but NOT for a room created live from
      // this modal. Without these calls the new private chat lands in the Redux
      // store but the XMPP server never sees a presence from us, so sending
      // messages / receiving the "Room created" placeholder state doesn't work and
      // users report the sidebar not settling / the chat not opening.
      if (client && normalizedChat.jid) {
        try {
          await client.presenceInRoomStanza(normalizedChat.jid);
        } catch (e) {
          console.warn('presenceInRoomStanza failed (non-fatal):', e);
        }
        try {
          // Small history window - the chat is fresh, but we still want to pull
          // any welcome/system messages the backend may have pushed into it.
          client.getHistoryStanza(normalizedChat.jid, 10);
        } catch (e) {
          console.warn('getHistoryStanza failed (non-fatal):', e);
        }
      }

      dispatch(setCurrentRoom({ roomJID: normalizedChat.jid }));

      showToast({
        id: Date.now().toString(),
        title: t('toast.success'),
        message: t('toast.roomCreatedSuccess'),
        type: 'success',
        duration: 3000,
      });
      return { jid: normalizedChat.jid };
    } catch (error) {
      console.error('Error handling room creation:', error);
      return null;
    }
  };

  // Create (or resolve) the 1:1 private room with `selectedUser` and make it the
  // current room. Shared by the Message and Call actions: Message just opens it,
  // Call additionally dials it. Returns the room identity needed to place a call,
  // or null on failure (a toast is shown).
  const ensurePrivateRoom = useCallback(async (): Promise<{
    jid: string;
    bareName: string;
    peerXmppUsername: string;
    peerDisplay: string;
  } | null> => {
    const peerDisplay =
      String(
        selectedUser?.name ||
          `${(selectedUser as any)?.firstName || ''} ${
            (selectedUser as any)?.lastName || ''
          }`
      ).trim() || '';

    if (config?.newArch !== false) {
      // Resolve the xmppUsername for postPrivateRoom. The backend accepts the local
      // part only (must startsWith(appId)). Historically `selectedUser.userJID` was
      // the xmppUsername but modern IUser shape doesn't carry that field; the chat
      // modal receives users via setSelectedUser from a message (where `.id` IS the
      // xmppUsername / MUC local-part) OR from the room-members fetch (where
      // `.xmppUsername` IS present). Prefer xmppUsername first, then userJID, then
      // id, to be forward-compatible with both shapes.
      const targetUsername =
        (selectedUser as any)?.xmppUsername ||
        (selectedUser as any)?.userJID ||
        selectedUser?.id;
      if (!targetUsername) {
        showToast({
          id: Date.now().toString(),
          title: t('toast.error'),
          message: t('toast.couldNotResolveRecipient'),
          type: 'error',
          duration: 4000,
        });
        return null;
      }
      try {
        const newRoom = await postPrivateRoom(targetUsername);
        const created = await handleRoomCreation(newRoom, 2);
        if (!created?.jid) return null;
        return {
          jid: created.jid,
          bareName: created.jid.split('@')[0],
          peerXmppUsername: String(targetUsername).split('@')[0],
          peerDisplay,
        };
      } catch (e: any) {
        console.error('postPrivateRoom failed:', e);
        showToast({
          id: Date.now().toString(),
          title: t('toast.error'),
          message: e?.message || t('toast.failedToCreatePrivateChat'),
          type: 'error',
          duration: 4000,
        });
        return null;
      }
    }

    const selectedUserUsername = walletToUsername(selectedUser.id);
    const myUsername = walletToUsername(user.defaultWallet.walletAddress);

    const combinedWalletAddress = [myUsername, selectedUserUsername]
      .sort()
      .join('.');

    const roomJid = combinedWalletAddress.toLowerCase();

    const combinedUsersName = [user.firstName, selectedUser.name?.split(' ')?.[0]]
      .sort()
      .join(' and ');

    const newRoomJid = await client.createPrivateRoomStanza(
      combinedUsersName,
      `Private chat ${combinedUsersName}`,
      roomJid
    );

    if (newRoomJid) {
      await client.inviteRoomRequestStanza(selectedUserUsername, newRoomJid);
      await client.getRoomsStanza();
    }
    if (!newRoomJid) return null;
    return {
      jid: newRoomJid,
      bareName: String(newRoomJid).split('@')[0],
      peerXmppUsername: selectedUserUsername,
      peerDisplay,
    };
  }, [selectedUser, config?.newArch, client, user]);

  const handlePrivateMessage = useCallback(async () => {
    showToast({
      id: Date.now().toString(),
      title: t('toast.roomCreationTitle'),
      message: t('toast.roomCreating'),
      type: 'info',
      duration: 3000,
    });
    await ensurePrivateRoom();
    dispatch(setActiveModal());
  }, [ensurePrivateRoom, dispatch, showToast, t]);

  const handleCall = useCallback(
    async (kind: 'audio' | 'video') => {
      const room = await ensurePrivateRoom();
      if (!room) return;

      const dialName = room.peerDisplay || room.bareName;
      dispatch(
        startOutgoingCall({
          roomJid: room.jid,
          roomName: dialName,
          roomBareName: room.bareName,
          kind,
          peerXmppUsername: room.peerXmppUsername || null,
        })
      );

      // The server drops `kind` on the relayed call-token, so signal the peer
      // directly first (fast chat message) - mirrors ChatHeader.placeCall.
      if (room.peerXmppUsername) {
        sendCallInviteSignal(kind, {
          peerXmppUsername: room.peerXmppUsername,
          roomBareName: room.bareName,
        });
      }

      // Close the profile modal so the call overlay isn't hidden behind it.
      dispatch(setActiveModal());

      try {
        await createChatCall(room.bareName, { kind });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t('toast.failedToCreateCall');
        dispatch(setCallError(message));
      }
    },
    [ensurePrivateRoom, dispatch, t]
  );

  const modalUser: any = selectedUser ?? user;

  const findLanguage = () => {
    if (langSource)
      return LANGUAGE_OPTIONS.find((lang) => lang.id === langSource);
    else return undefined;
  };

  const headerActions = !selectedUser ? (
    <>
      <Button onClick={EditClick} aria-label={t('action.editProfile')}>
        <EditIcon color="var(--ethora-color-text-muted, #8C8C8C)" />
      </Button>
      <DropdownMenu
        options={menuOptions}
        position="left"
        menuIcon={<MoreIcon />}
      />
    </>
  ) : undefined;

  // Cancel/Save live in the SAME header slot the drawer always uses, right
  // where the edit/overflow controls sit when not editing - one header row,
  // not two. Save calls into EditUserModal's own field state via the
  // imperative handle; Cancel just flips back out of editing mode.
  const editingHeaderActions = (
    <>
      <Button
        variant="ghost"
        onClick={() => setIsEditing(false)}
        style={{ width: 'auto', padding: '0 var(--ethora-space-3, 12px)' }}
      >
        {t('action.cancel')}
      </Button>
      <Button
        variant="filled"
        onClick={() => void editHandleRef.current?.save()}
        style={{ width: 'auto', padding: '0 var(--ethora-space-4, 16px)' }}
      >
        {t('action.save')}
      </Button>
    </>
  );

  const showActions =
    selectedUser &&
    selectedUser.xmppUsername !== user.xmppUsername &&
    !config?.disableProfilesInteractions;

  // Grouped into labelled sections instead of a stack of anonymous bordered
  // boxes: identity first (no heading - the avatar and name are the heading),
  // then About, then the reader-language preference, then the actions you can
  // take on someone else's profile.
  const DefaultBody = useMemo(
    () => (
      <>
        <ProfileHero>
          <ProfileImagePlaceholder
            icon={modalUser?.profileImage ?? null}
            name={modalUser?.name ?? modalUser?.firstName}
            size={96}
          />
          <ProfileHeroName>
            {modalUser?.name
              ? `${modalUser?.name}`
              : `${modalUser?.firstName} ${modalUser?.lastName}`}
          </ProfileHeroName>
        </ProfileHero>

        <DrawerSection>
          <DrawerSectionTitle>{t('modal.profile.about')}</DrawerSectionTitle>
          <DrawerDescriptionText
            $empty={!(modalUser?.description && modalUser?.description?.length > 4)}
          >
            {modalUser?.description && modalUser?.description?.length > 4
              ? modalUser.description
              : t('modal.profile.noDescription')}
          </DrawerDescriptionText>
        </DrawerSection>

        {!selectedUser && config?.translates?.enabled && (
          <DrawerSection>
            <DrawerSectionTitle>
              {t('modal.profile.preferences')}
            </DrawerSectionTitle>
            <DrawerCard>
              <DrawerCardBody>
                <DrawerHint>{t('modal.profile.languageHint')}</DrawerHint>
                <Select
                  options={LANGUAGE_OPTIONS}
                  placeholder={t('language.select')}
                  onSelect={handleSelect}
                  accentColor={config?.colors?.primary}
                  selectedValue={findLanguage()}
                />
              </DrawerCardBody>
            </DrawerCard>
          </DrawerSection>
        )}

        {showActions && (
          <DrawerSection>
            <DrawerSectionTitle>
              {t('modal.profile.actions')}
            </DrawerSectionTitle>
            <ProfileActions>
              <ActionButton
                StartIcon={<ChatIcon />}
                onClick={handlePrivateMessage}
                variant="filled"
              >
                {t('action.message')}
              </ActionButton>
              {canCall && (
                <ActionButton
                  StartIcon={<VideoCallIcon color="var(--ethora-color-text-on-primary, #FFFFFF)" />}
                  onClick={() => void handleCall('video')}
                  disabled={isCallBusy}
                  variant="filled"
                >
                  {isAudioCallsEnabled ? t('action.videoCall') : t('action.call')}
                </ActionButton>
              )}
              {isAudioCallsEnabled && (
                <ActionButton
                  StartIcon={<AudioCallIcon color="var(--ethora-color-text-on-primary, #FFFFFF)" />}
                  onClick={() => void handleCall('audio')}
                  disabled={isCallBusy}
                  variant="filled"
                >
                  {t('action.audioCall')}
                </ActionButton>
              )}
              <ActionButton
                onClick={() => handleCopyClick(selectedUser.id)}
                variant="outlined"
              >
                {t('action.copyUserId')}
              </ActionButton>
            </ProfileActions>
          </DrawerSection>
        )}
      </>
    ),
    [
      modalUser,
      canCall,
      isAudioCallsEnabled,
      isCallBusy,
      handleCall,
      handlePrivateMessage,
      selectedUser,
      showActions,
      user,
      config,
      langSource,
      t,
    ]
  );

  const EditingBody = useMemo(
    () => (
      <EditUserModal
        ref={editHandleRef}
        setIsEditing={setIsEditing}
        modalUser={modalUser}
        config={config}
      />
    ),
    [modalUser]
  );

  return (
    <SideDrawer
      title={t('modal.profile.title')}
      onClose={handleBackClick}
      headerActions={isEditing ? editingHeaderActions : headerActions}
    >
      {!isEditing ? DefaultBody : EditingBody}
    </SideDrawer>
  );
};

export default UserProfileModal;
