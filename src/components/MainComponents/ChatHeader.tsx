import React, { useCallback } from 'react';
import {
  ChatContainerHeader,
  ChatContainerHeaderBoxInfo,
  ChatContainerHeaderInfo,
  ChatContainerHeaderLabel,
} from '../styled/StyledComponents';
import RoomList from './RoomList';
import { IRoom } from '../../types/types';
import { ProfileImagePlaceholder } from './ProfileImagePlaceholder';
import Button from '../styled/Button';
import { BackIcon, VideoCallIcon } from '../../assets/icons';
import { useDispatch, useSelector } from 'react-redux';
import Composing from '../styled/StyledInputComponents/Composing';
import {
  deleteRoom,
  setCurrentRoom,
  setIsLoading,
  setOpenReportModal,
  updateRoom,
} from '../../roomStore/roomsSlice';
import { useXmppClient } from '../../context/xmppProvider';
import { setActiveModal } from '../../roomStore/chatSettingsSlice';
import { RootState } from '../../roomStore';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { RoomMenu } from '../MenuRoom/MenuRoom';
import { useRoomState } from '../../hooks/useRoomState';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { formatNumberWithCommas } from '../../helpers/formatNumberWithCommas';
import { createChatCall } from '../../networking/api-requests/rooms.api';
import {
  setCallError,
  startOutgoingCall,
} from '../../roomStore/callSlice';

interface ChatHeaderProps {
  currentRoom: IRoom;
  handleBackClick?: (value: boolean) => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  currentRoom,
  handleBackClick,
}) => {
  const dispatch = useDispatch();
  const { client } = useXmppClient();

  const { roomsList, activeRoomJID } = useRoomState(currentRoom.jid);
  const { composing } = useRoomState(currentRoom.jid).room;
  const { config } = useChatSettingState();
  const call = useSelector((state: RootState) => state.call);

  const videoCallsConfig = config?.videoCalls;
  const allowedRoomTypes = videoCallsConfig?.allowedRoomTypes || ['private'];
  const isVideoCallsEnabled = videoCallsConfig?.enabled === true;
  const isPrivateRoom = currentRoom?.type === 'private';
  const isRoomAllowedByType = isPrivateRoom && allowedRoomTypes.includes('private');
  const isRoomAllowed = isRoomAllowedByType;
  const hasLivekitUrl = Boolean(videoCallsConfig?.livekitUrl?.trim());
  const isCallBusy = call.phase !== 'idle';
  const canCall = isVideoCallsEnabled && isRoomAllowed && hasLivekitUrl;

  const callDisabledReason = !isRoomAllowed
    ? 'Video calls are available only in 1:1 rooms for v1'
    : !hasLivekitUrl
      ? 'Video calls unavailable: missing config.videoCalls.livekitUrl'
      : isCallBusy
        ? 'Another call is already in progress'
        : '';

  const handleReportClick = () => {
    dispatch(setOpenReportModal({ isOpen: true }));
  };

  const handleChangeChat = (chat: IRoom) => {
    dispatch(
      updateRoom({ jid: chat.jid, updates: { ...chat, unreadMessages: 0 } })
    );
    dispatch(setCurrentRoom({ roomJID: chat.jid }));
    dispatch(setIsLoading({ chatJID: chat.jid, loading: true }));
  };

  const handleLeaveClick = useCallback(() => {
    client.leaveTheRoomStanza(activeRoomJID);
    dispatch(deleteRoom({ jid: activeRoomJID }));

    if (
      Object.keys(roomsList).length < 1 ||
      activeRoomJID === Object.keys(roomsList)[0]
    ) {
      if (typeof window !== 'undefined') {
        const newUrl = `${window.location.pathname}`;
        window.history.pushState(null, '', newUrl);
      }
      dispatch(setCurrentRoom({ roomJID: null }));
      return;
    }

    const nextRoomJID = Object.keys(roomsList)[0] || null;
    if (nextRoomJID) {
      dispatch(setCurrentRoom({ roomJID: nextRoomJID }));
    }
  }, [activeRoomJID, roomsList, dispatch, client]);

  const handleVideoCallClick = useCallback(async () => {
    if (!canCall || isCallBusy || !currentRoom?.jid || !currentRoom?.name) {
      return;
    }

    dispatch(
      startOutgoingCall({
        roomJid: currentRoom.jid,
        roomName: currentRoom.name,
      })
    );

    try {
      await createChatCall(currentRoom.name);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create call';
      dispatch(setCallError(message));
    }
  }, [
    canCall,
    isCallBusy,
    currentRoom?.jid,
    currentRoom?.name,
    dispatch,
  ]);

  return (
    <ChatContainerHeader>
      {/* todo add here list of rooms */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {!config?.disableRooms && handleBackClick && (
          <Button
            EndIcon={<BackIcon />}
            onClick={() => handleBackClick(false)}
          />
        )}
        {config?.chatHeaderBurgerMenu && roomsList && (
          <RoomList
            chats={Object.values(roomsList)}
            burgerMenu
            onRoomClick={handleChangeChat}
          />
        )}
        <ChatContainerHeaderBoxInfo
          onClick={
            config?.disableChatInfo?.disableHeader
              ? undefined
              : () => dispatch(setActiveModal(MODAL_TYPES.CHAT_PROFILE))
          }
          style={
            config?.disableChatInfo?.disableHeader
              ? { cursor: 'default' }
              : undefined
          }
        >
          <div>
            <ProfileImagePlaceholder
              name={currentRoom.name}
              size={40}
              icon={currentRoom?.icon}
              active={true}
            />
          </div>
          <ChatContainerHeaderInfo>
            <ChatContainerHeaderLabel>
              {currentRoom?.title}
            </ChatContainerHeaderLabel>
            <ChatContainerHeaderLabel
              style={{ color: '#8C8C8C', fontSize: '14px' }}
            >
              {composing ? (
                <Composing usersTyping={currentRoom?.composingList} />
              ) : (
                `${formatNumberWithCommas(currentRoom?.usersCnt)} ${currentRoom?.usersCnt === 1 ? 'user' : 'users'}`
              )}
            </ChatContainerHeaderLabel>
          </ChatContainerHeaderInfo>
        </ChatContainerHeaderBoxInfo>
      </div>

      {!config?.disableChatInfo?.disableChatHeaderMenu && (
        <div style={{ display: 'flex', gap: 16 }}>
          {canCall && !isCallBusy && (
            <button
              onClick={() => {
                void handleVideoCallClick();
              }}
              disabled={!canCall || isCallBusy}
              title={callDisabledReason}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                border: 'none',
                background: !canCall || isCallBusy ? '#D1D5DB' : '#10B981',
                color: '#FFFFFF',
                cursor:
                  !canCall || isCallBusy ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <VideoCallIcon />
            </button>
          )}
          {/* <SearchInput animated icon={<SearchIcon />} /> */}
          <RoomMenu
            handleLeaveClick={handleLeaveClick}
            handleReportClick={handleReportClick}
          />
        </div>
      )}
    </ChatContainerHeader>
  );
};

export default ChatHeader;
