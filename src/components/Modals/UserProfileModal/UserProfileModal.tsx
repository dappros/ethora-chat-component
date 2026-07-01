import React, { useCallback, useMemo, useState } from 'react';
import {
  CenterContainer,
  UserInfo,
  UserName,
  UserStatus,
  ModalContainerFullScreen,
  ActionButton,
  Label,
  BorderedContainer,
  LabelData,
} from '../styledModalComponents';
import {
  AudioCallIcon,
  ChatIcon,
  EditIcon,
  LeaveIcon,
  MoreIcon,
  VideoCallIcon,
} from '../../../assets/icons';
import ModalHeaderComponent from '../ModalHeaderComponent';
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
import EditUserModal from './EditUserModal';
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
import { useRoomState } from '../../../hooks/useRoomState';
import { useAppDispatch } from '../../../hooks/hooks';
import { logoutService } from '../../../hooks/useLogout';

interface UserProfileModalProps {
  handleCloseModal: any;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  handleCloseModal,
}) => {
  const dispatch = useAppDispatch();

  const { client } = useXmppClient();
  const { usersSet } = useRoomState();
  const { showToast } = useToast();

  const { config, user, selectedUser, langSource } = useSelector(
    (state: RootState) => state.chatSettingStore
  );
  const callPhase = useSelector((state: RootState) => state.call.phase);

  const [isEditing, setIsEditing] = useState<boolean>(false);

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
        label: 'Log Out',
        icon: <LeaveIcon />,
        onClick: () => {
          handleLogout();
        },
        styles: { color: 'red' },
      },
    ],
    []
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
          title: 'Error',
          message: 'Could not open the new private chat',
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
        title: 'Success!',
        message: 'Room created succusfully!',
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
          title: 'Error',
          message: 'Could not resolve recipient',
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
          title: 'Error',
          message: e?.message || 'Failed to create private chat',
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
      title: 'Room creation',
      message: 'Room is being created...',
      type: 'info',
      duration: 3000,
    });
    await ensurePrivateRoom();
    dispatch(setActiveModal());
  }, [ensurePrivateRoom, dispatch, showToast]);

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
      // directly first (fast chat message) — mirrors ChatHeader.placeCall.
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
          error instanceof Error ? error.message : 'Failed to create call';
        dispatch(setCallError(message));
      }
    },
    [ensurePrivateRoom, dispatch]
  );

  const modalUser: any = selectedUser ?? user;

  const findLanguage = () => {
    if (langSource)
      return LANGUAGE_OPTIONS.find((lang) => lang.id === langSource);
    else return undefined;
  };

  const DefaultBody = useMemo(
    () => (
      <>
        <ModalHeaderComponent
          handleCloseModal={handleBackClick}
          headerTitle={'Profile'}
          rightMenu={
            !selectedUser && (
              <>
                <Button onClick={EditClick}>
                  <EditIcon color="#8C8C8C" />
                </Button>
                <DropdownMenu
                  options={menuOptions}
                  position="left"
                  menuIcon={<MoreIcon />}
                />
              </>
            )
          }
        />
        <CenterContainer>
          <ProfileImagePlaceholder
            icon={modalUser?.profileImage ?? null}
            name={modalUser?.name ?? modalUser?.firstName}
            size={120}
          />
          <UserInfo>
            <UserName>
              {modalUser?.name
                ? `${modalUser?.name}`
                : `${modalUser?.firstName} ${modalUser?.lastName}`}
            </UserName>
            {/* <UserStatus>Status</UserStatus> */}
          </UserInfo>
          {!selectedUser && config?.translates?.enabled && (
            <BorderedContainer>
              <Select
                options={LANGUAGE_OPTIONS}
                placeholder={'Select your language'}
                onSelect={handleSelect}
                accentColor={config?.colors?.primary}
                selectedValue={findLanguage()}
              />
            </BorderedContainer>
          )}
          <BorderedContainer>
            <Label>About</Label>
            <LabelData>
              {modalUser?.description && modalUser?.description?.length > 4
                ? modalUser.description
                : 'No description'}
            </LabelData>
          </BorderedContainer>
          {selectedUser &&
            selectedUser.xmppUsername !== user.xmppUsername &&
            !config?.disableProfilesInteractions && (
              <>
                <ActionButton
                  StartIcon={<ChatIcon />}
                  onClick={handlePrivateMessage}
                  variant="filled"
                >
                  Message
                </ActionButton>
                {canCall && (
                  <ActionButton
                    StartIcon={<VideoCallIcon color="#FFFFFF" />}
                    onClick={() => void handleCall('video')}
                    disabled={isCallBusy}
                    variant="filled"
                  >
                    {isAudioCallsEnabled ? 'Video call' : 'Call'}
                  </ActionButton>
                )}
                {isAudioCallsEnabled && (
                  <ActionButton
                    StartIcon={<AudioCallIcon color="#FFFFFF" />}
                    onClick={() => void handleCall('audio')}
                    disabled={isCallBusy}
                    variant="filled"
                  >
                    Audio call
                  </ActionButton>
                )}
                <ActionButton
                  onClick={() => handleCopyClick(selectedUser.id)}
                  variant="filled"
                >
                  Copy User Id
                </ActionButton>
              </>
            )}
          {/* <EmptySection /> */}
        </CenterContainer>
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
      user,
      config,
    ]
  );

  const EditingBody = useMemo(
    () => (
      <EditUserModal
        setIsEditing={setIsEditing}
        modalUser={modalUser}
        config={config}
      />
    ),
    [modalUser]
  );

  return (
    <ModalContainerFullScreen>
      {!isEditing ? DefaultBody : EditingBody}
    </ModalContainerFullScreen>
  );
};

export default UserProfileModal;
