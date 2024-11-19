import React, { useCallback, useMemo } from 'react';
import {
  ChatContainerHeader,
  ChatContainerHeaderLabel,
} from '../styled/StyledComponents';
import RoomList from './RoomList';
import { IRoom } from '../../types/types';
import { ProfileImagePlaceholder } from './ProfileImagePlaceholder';
import Button from '../styled/Button';
import { LeaveIcon, MoreIcon, ReportIcon } from '../../assets/icons';
import { RootState } from '../../roomStore';
import { useDispatch, useSelector } from 'react-redux';
import Composing from '../styled/StyledInputComponents/Composing';
import {
  deleteRoom,
  setCurrentRoom,
  setIsLoading,
} from '../../roomStore/roomsSlice';
import DropdownMenu from '../DropdownMenu/DropdownMenu';
import { useXmppClient } from '../../context/xmppProvider';
import { setActiveModal } from '../../roomStore/chatSettingsSlice';

interface ChatHeaderProps {
  currentRoom: IRoom;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ currentRoom }) => {
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

  const menuOptions = useMemo(
    () => [
      {
        label: 'Report',
        icon: <ReportIcon />,
        onClick: () => {
          console.log('Report clicked');
        },
        styles: { color: 'red' },
      },
      {
        label: 'Leave',
        icon: <LeaveIcon />,
        onClick: () => {
          handleLeaveClick();
        },
        styles: { color: 'red' },
      },
    ],
    [activeRoomJID]
  );

  return (
    <ChatContainerHeader>
      {/* todo add here list of rooms */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {config?.chatHeaderBurgerMenu && rooms && (
          <RoomList
            chats={Object.values(rooms)}
            burgerMenu
            onRoomClick={handleChangeChat}
          />
        )}
        <div
          style={{ display: 'flex', gap: '8px', cursor: 'pointer' }}
          onClick={() => dispatch(setActiveModal('chatprofile'))}
        >
          <div>
            <ProfileImagePlaceholder
              name={currentRoom.name}
              size={40}
              icon={currentRoom?.icon}
              active={true}
            />
          </div>
          <div
            style={{
              textAlign: 'start',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <ChatContainerHeaderLabel>
              {currentRoom?.title}
            </ChatContainerHeaderLabel>
            <ChatContainerHeaderLabel
              style={{ color: '#8C8C8C', fontSize: '14px' }}
            >
              {composing ? (
                <Composing usersTyping={['User']} />
              ) : (
                `${currentRoom?.usersCnt} users`
              )}
            </ChatContainerHeaderLabel>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* <SearchInput animated icon={<SearchIcon />} /> */}
        <DropdownMenu
          position="left"
          options={menuOptions}
          openButton={
            <Button style={{ padding: 8 }} EndIcon={<MoreIcon />} unstyled />
          }
        />
      </div>
    </ChatContainerHeader>
  );
};

export default ChatHeader;
