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
import { RootState } from '../../roomStore';
import { useDispatch, useSelector } from 'react-redux';
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

  const { composing } = useSelector(
    (state: RootState) => state.rooms.rooms[currentRoom.jid]
  );

  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

  const { rooms, activeRoomJID } = useSelector(
    (state: RootState) => state.rooms
  );

  const handleChangeChat = (chat: IRoom) => {
    dispatch(setCurrentRoom({ roomJID: chat.jid }));
    dispatch(setIsLoading({ chatJID: chat.jid, loading: true }));
  };

  const handleLeaveClick = useCallback(() => {
    client.leaveTheRoomStanza(activeRoomJID);
    dispatch(deleteRoom({ jid: activeRoomJID }));

    const nextRoomJID = Object.keys(rooms)[0] || null;
    if (nextRoomJID) {
      dispatch(setCurrentRoom({ roomJID: nextRoomJID }));
    }
  }, [activeRoomJID, rooms, dispatch, client]);

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
        {config?.chatHeaderBurgerMenu && rooms && (
          <RoomList
            chats={Object.values(rooms)}
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
                `${currentRoom?.usersCnt} users`
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
