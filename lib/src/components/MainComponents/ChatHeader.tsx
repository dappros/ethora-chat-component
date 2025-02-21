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
import { BackIcon } from '../../assets/icons';
import { useDispatch } from 'react-redux';
import Composing from '../styled/StyledInputComponents/Composing';
import {
  deleteRoom,
  setCurrentRoom,
  setIsLoading,
} from '../../roomStore/roomsSlice';
import { useXmppClient } from '../../context/xmppProvider';
import { setActiveModal } from '../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { RoomMenu } from '../MenuRoom/MenuRoom';
import { useRoomState } from '../../hooks/useRoomState';
import { useChatSettingState } from '../../hooks/useChatSettingState';

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

  const handleChangeChat = (chat: IRoom) => {
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
      const newUrl = `${window.location.pathname}`;
      window.history.pushState(null, '', newUrl);
      dispatch(setCurrentRoom({ roomJID: null }));
      return;
    }

    const nextRoomJID = Object.keys(roomsList)[0] || null;
    if (nextRoomJID) {
      dispatch(setCurrentRoom({ roomJID: nextRoomJID }));
    }
  }, [activeRoomJID, roomsList, dispatch, client]);

  return (
    <ChatContainerHeader>
      {/* todo add here list of rooms */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {handleBackClick && (
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
          onClick={() => dispatch(setActiveModal(MODAL_TYPES.CHAT_PROFILE))}
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
                `${currentRoom?.usersCnt} ${currentRoom?.usersCnt === 1 ? 'user' : 'users'}`
              )}
            </ChatContainerHeaderLabel>
          </ChatContainerHeaderInfo>
        </ChatContainerHeaderBoxInfo>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* <SearchInput animated icon={<SearchIcon />} /> */}
        <RoomMenu handleLeaveClick={handleLeaveClick} />
      </div>
    </ChatContainerHeader>
  );
};

export default ChatHeader;
