import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import styled, { css } from 'styled-components';
import { IRoom } from '../../types/types';
import { ChatHeaderAvatar } from './ChatHeaderAvatar';
import { SearchInput } from '../InputComponents/Search';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { getTintedColor } from '../../helpers/getTintedColor';
import { SearchIcon } from '../../assets/icons';
import DropdownMenu from '../DropdownMenu/DropdownMenu';
import { logout, setActiveModal } from '../../roomStore/chatSettingsSlice';
import NewChatModal from '../Modals/NewChatModal/NewChatModal';
import { setLogoutState } from '../../roomStore/roomsSlice';

interface RoomListProps {
  chats: IRoom[];
  burgerMenu?: boolean;
  onRoomClick?: (chat: IRoom) => void;
}

const Container = styled.div<{ burgerMenu?: boolean; open?: boolean }>`
  ${({ burgerMenu, open }) =>
    burgerMenu
      ? css`
          position: fixed;
          left: 0;
          top: 0;
          width: 300px;
          height: 100%;
          transform: ${open ? 'translateX(0)' : 'translateX(-100%)'};
          transition: transform 0.3s ease-in-out;
          z-index: 2;
          display: flex;
          flex-direction: column;
          background-color: #fff;
          padding: 16px 12px;
          z-index: 1000;
          border-right: 1px solid var(--Colors-Border-border-primary, #f0f0f0);
        `
      : css`
          padding: 16px 12px;
          overflow: auto;
          display: relative;
          z-index: 2;
          background-color: #fff;
          min-width: 375px;
          border-right: 1px solid var(--Colors-Border-border-primary, #f0f0f0);
        `}
`;

const BurgerButton = styled.button`
  /* position: fixed; */
  left: 10px;
  top: 10px;
  color: #333;
  border: none;
  padding: 10px;
  cursor: pointer;
  z-index: 1000;
`;

const ChatItem = styled.div<{ active: boolean; bg?: string }>`
  display: flex;
  justify-content: space-between;
  border-radius: 16px;
  padding: 10px;
  cursor: pointer;
  background-color: ${({ active, bg }) =>
    active ? (bg ? bg : '#0052CD') : '#fff'};
  color: ${({ active }) => (!active ? '#000' : '#fff')};

  &:hover {
    background-color: ${({ active, bg }) =>
      active ? getTintedColor(bg ? bg : '#0052CD') : 'rgba(0, 0, 0, 0.05)'};
  }
`;

const SearchContainer = styled.div<{}>`
  display: flex;
  gap: 16px;
  align-items: center;
  width: 100%;
  height: 50px;
  padding-bottom: 12px;
`;

const ScollableContainer = styled.div<{}>`
  height: 100%;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  position: sticky;
`;

const ChatInfo = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 60%;
  text-align: start;
`;

const ChatName = styled.div`
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const LastMessage = styled.div`
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const UserCount = styled.div<{ active: boolean }>`
  color: ${({ active }) => (!active ? '#000' : '#fff')};
  margin-left: auto;
`;

const Divider = styled.div`
  height: 1px;
  width: 100%;
  background-color: #0052cd0d;
`;

const RoomList: React.FC<RoomListProps> = ({
  chats,
  burgerMenu = false,
  onRoomClick,
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const dispatch = useDispatch();

  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );

  const { activeRoomJID } = useSelector((state: RootState) => state.rooms);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (
      containerRef.current &&
      !containerRef.current.contains(event.target as Node)
    ) {
      setOpen(false);
    }
  }, []);

  const performClick = useCallback(
    (chat: IRoom) => {
      onRoomClick?.(chat);
      setOpen(false);
    },
    [onRoomClick]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(e.target.value);
    },
    []
  );

  const filteredChats = useMemo(
    () =>
      chats.filter((chat) =>
        chat.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [chats, searchTerm]
  );

  useEffect(() => {
    if (burgerMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [burgerMenu, handleClickOutside]);

  const isChatActive = useCallback(
    (room: IRoom) => activeRoomJID === room.jid,
    [activeRoomJID]
  );

  const handleLogout = useCallback(() => {
    dispatch(logout());
    dispatch(setLogoutState());
  }, []);

  const menuOptions = useMemo(
    () => [
      {
        label: 'Profile',
        icon: null,
        onClick: () => {
          dispatch(setActiveModal('profile'));
          console.log('Profile clicked');
        },
      },
      {
        label: 'Settings',
        icon: null,
        onClick: () => {
          dispatch(setActiveModal('settings'));
          console.log('Settings clicked');
        },
      },
      {
        label: 'Logout',
        icon: null,
        onClick: () => handleLogout(),
      },
    ],
    []
  );

  return (
    <>
      {burgerMenu && !open && (
        <BurgerButton onClick={() => setOpen(!open)}>☰</BurgerButton>
      )}
      <Container
        burgerMenu={burgerMenu}
        open={open}
        ref={containerRef}
        style={config.roomListStiles}
      >
        {(open || !burgerMenu) && (
          <ScollableContainer>
            <SearchContainer>
              {/* <DropdownMenu
                options={menuOptions}
                // onClose={dispatch(setActiveModal())}
              /> */}
              <SearchInput
                icon={<SearchIcon height={'20px'} />}
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Search..."
                // animated={true}
              />

              {/* <NewChatModal /> */}
            </SearchContainer>
            <div style={{ flexGrow: 1, overflowY: 'auto' }}>
              {filteredChats.map((chat, index) => (
                <>
                  <ChatItem
                    key={index}
                    active={isChatActive(chat)}
                    onClick={() => performClick(chat)}
                    bg={config?.colors?.primary}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'start',
                        width: '100%',
                        gap: '8px',
                      }}
                    >
                      {chat.icon ? (
                        <img src={chat.icon} alt="Icon" />
                      ) : (
                        <ChatHeaderAvatar name={chat.name} />
                      )}
                      <ChatInfo>
                        <ChatName>{chat.name}</ChatName>
                        <LastMessage
                          style={{ color: '#141414', fontWeight: 600 }}
                        >
                          {chat?.lastRoomMessage?.name &&
                            `${chat?.lastRoomMessage?.name}:`}
                        </LastMessage>
                        <LastMessage>{chat?.lastRoomMessage?.body}</LastMessage>
                      </ChatInfo>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex' }}>
                      <UserCount active={isChatActive(chat)}>
                        {chat.usersCnt}
                      </UserCount>
                      {/* <div>{chat.lastMessageTime}</div> */}
                    </div>
                  </ChatItem>
                  <Divider />
                </>
              ))}
            </div>
          </ScollableContainer>
        )}
      </Container>
    </>
  );
};

export default RoomList;
