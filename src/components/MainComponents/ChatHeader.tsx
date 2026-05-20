import React, { useCallback, useState } from 'react';
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
import { AudioCallIcon, BackIcon, VideoCallIcon } from '../../assets/icons';
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
import { ModalWrapper } from '../Modals/ModalWrapper/ModalWrapper';

interface ChatHeaderProps {
  currentRoom: IRoom;
  handleBackClick?: (value: boolean) => void;
}

const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const looksLikeRawJidLocalPart = (
  value: string | undefined,
  jid: string | undefined
): boolean => {
  if (!value) return true;
  const localPart = (jid || '').split('@')[0];
  if (localPart && value === localPart) return true;
  if (UUID_LIKE.test(value)) return true;
  return false;
};

const getDisplayTitle = (room: IRoom | undefined): string => {
  const title = room?.title?.trim();
  if (looksLikeRawJidLocalPart(title, room?.jid)) {
    return 'Loading…';
  }
  return title as string;
};


const getDisplayCount = (room: IRoom | undefined): number => {
  if (Array.isArray(room?.members) && room.members.length > 0) {
    return room.members.length;
  }
  return typeof room?.usersCnt === 'number' && room.usersCnt > 0
    ? room.usersCnt
    : 0;
};

const ChatHeader: React.FC<ChatHeaderProps> = ({
  currentRoom,
  handleBackClick,
}) => {
  const dispatch = useDispatch();
  const { client } = useXmppClient();
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);

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
    setIsLeaveModalOpen(true);
  }, []);

  const handleCancelLeave = useCallback(() => {
    setIsLeaveModalOpen(false);
  }, []);

  const handleConfirmLeave = useCallback(() => {
    if (!activeRoomJID) {
      setIsLeaveModalOpen(false);
      return;
    }

    client.leaveTheRoomStanza(activeRoomJID);
    dispatch(deleteRoom({ jid: activeRoomJID }));

    const nextRoomJID =
      Object.keys(roomsList).find((roomJID) => roomJID !== activeRoomJID) ||
      null;

    if (!nextRoomJID) {
      if (typeof window !== 'undefined') {
        const newUrl = `${window.location.pathname}`;
        window.history.pushState(null, '', newUrl);
      }
      dispatch(setCurrentRoom({ roomJID: null }));
      setIsLeaveModalOpen(false);
      return;
    }

    dispatch(setCurrentRoom({ roomJID: nextRoomJID }));
    setIsLeaveModalOpen(false);
  }, [activeRoomJID, roomsList, dispatch, client]);

  const placeCall = useCallback(
    async (kind: 'audio' | 'video') => {
      if (!canCall || isCallBusy || !currentRoom?.jid || !currentRoom?.name) {
        return;
      }

      dispatch(
        startOutgoingCall({
          roomJid: currentRoom.jid,
          roomName: currentRoom.name,
          kind,
        })
      );

      try {
        await createChatCall(currentRoom.name, { kind });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to create call';
        dispatch(setCallError(message));
      }
    },
    [canCall, isCallBusy, currentRoom?.jid, currentRoom?.name, dispatch]
  );

  const handleVideoCallClick = useCallback(
    () => placeCall('video'),
    [placeCall]
  );

  const handleAudioCallClick = useCallback(
    () => placeCall('audio'),
    [placeCall]
  );

  return (
    <>
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
                {(() => {
                  if (composing) {
                    return <Composing usersTyping={currentRoom?.composingList} />;
                  }
                  const displayCount = getDisplayCount(currentRoom);
                  if (displayCount <= 0) return '';
                  return `${formatNumberWithCommas(displayCount)} ${displayCount === 1 ? 'user' : 'users'}`;
                })()}
              </ChatContainerHeaderLabel>
            </ChatContainerHeaderInfo>
          </ChatContainerHeaderBoxInfo>
        </div>

        {!config?.disableChatInfo?.disableChatHeaderMenu && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {canCall && !isCallBusy && (
              <>
                <button
                  onClick={() => {
                    void handleAudioCallClick();
                  }}
                  disabled={!canCall || isCallBusy}
                  title={callDisabledReason || 'Start audio call'}
                  aria-label="Start audio call"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    border: 'none',
                    background:
                      !canCall || isCallBusy ? '#D1D5DB' : '#0EA5E9',
                    color: '#FFFFFF',
                    cursor:
                      !canCall || isCallBusy ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AudioCallIcon />
                </button>
                <button
                  onClick={() => {
                    void handleVideoCallClick();
                  }}
                  disabled={!canCall || isCallBusy}
                  title={callDisabledReason || 'Start video call'}
                  aria-label="Start video call"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    border: 'none',
                    background:
                      !canCall || isCallBusy ? '#D1D5DB' : '#10B981',
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
              </>
            )}
            <RoomMenu
              handleLeaveClick={handleLeaveClick}
              handleReportClick={handleReportClick}
            />
          </div>
        )}
      </ChatContainerHeader>
      {isLeaveModalOpen && (
        <ModalWrapper
          title="Leave Chat"
          description="Are you sure you want to leave this chat?"
          buttonText="Yes"
          cancelText="No"
          backgroundColorButton="#E53935"
          handleClick={handleConfirmLeave}
          handleCloseModal={handleCancelLeave}
        />
      )}
    </>
  );
};

export default ChatHeader;
