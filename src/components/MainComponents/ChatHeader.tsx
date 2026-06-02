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
import { BackIcon } from '../../assets/icons';
import { useDispatch } from 'react-redux';
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
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { RoomMenu } from '../MenuRoom/MenuRoom';
import { useRoomState } from '../../hooks/useRoomState';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { formatNumberWithCommas } from '../../helpers/formatNumberWithCommas';
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

// Reconcile the participant count between two sources that can drift out
// of sync:
//   - `usersCnt`: live MUC occupant count from XMPP roominfo (or 0 when
//     presence is forbidden / hasn't fired yet).
//   - `members.length`: the authoritative membership list from
//     /chats/my (or onRoomMembershipChange).
// When presence is blocked for a user, XMPP roominfo can land at 1 (or 0)
// while members[] correctly holds 3+ entries. Showing "1 user" in the
// header while the chat profile lists 3 looks broken to the user. Take
// the max so the header reflects the higher-confidence number.
const getDisplayCount = (room: IRoom | undefined): number => {
  const fromCnt =
    typeof room?.usersCnt === 'number' && room.usersCnt > 0 ? room.usersCnt : 0;
  const fromMembers = Array.isArray(room?.members) ? room.members.length : 0;
  return Math.max(fromCnt, fromMembers);
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

  return (
    <>
      <ChatContainerHeader>
        {/* todo add here list of rooms */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {!config?.disableRooms && handleBackClick && (
            <Button
              data-testid="chat_back_button"
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
          <div style={{ display: 'flex', gap: 16 }}>
            {/* <SearchInput animated icon={<SearchIcon />} /> */}
            <RoomMenu
              handleLeaveClick={handleLeaveClick}
              handleReportClick={handleReportClick}
            />
          </div>
        )}
      </ChatContainerHeader>
      {isLeaveModalOpen && (
        <div>
          <ModalWrapper
            title="Leave Chat"
            description="Are you sure you want to leave this chat?"
            buttonText="Yes"
            cancelText="No"
            backgroundColorButton="#E53935"
            handleClick={handleConfirmLeave}
            handleCloseModal={handleCancelLeave}
          />
          <ChatContainerHeaderBoxInfo>
            <ChatContainerHeaderInfo>
              <ChatContainerHeaderLabel>
                {getDisplayTitle(currentRoom)}
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
      )}
    </>
  );
};

export default ChatHeader;
