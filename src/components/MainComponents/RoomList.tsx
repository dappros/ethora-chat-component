import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { IRoom } from '../../types/types';
import { ProfileImagePlaceholder } from './ProfileImagePlaceholder';
import { SearchInput } from '../InputComponents/Search';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { SearchIcon } from '../../assets/icons';
import DropdownMenu from '../DropdownMenu/DropdownMenu';
import { logout, setActiveModal } from '../../roomStore/chatSettingsSlice';
import NewChatModal from '../Modals/NewChatModal/NewChatModal';
import { setLogoutState } from '../../roomStore/roomsSlice';
import {
  BurgerButton,
  ChatInfo,
  ChatItem,
  ChatName,
  Container,
  Divider,
  LastMessage,
  ScollableContainer,
  SearchContainer,
  UserCount,
} from '../styled/RoomListComponents';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';

interface RoomListProps {
  chats: IRoom[];
  burgerMenu?: boolean;
  onRoomClick?: (chat: IRoom) => void;
  isSmallScreen?: boolean;
}

const RoomList: React.FC<RoomListProps> = ({
  chats,
  burgerMenu = false,
  onRoomClick,
  isSmallScreen,
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

  const filteredChats = useMemo(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const chatsMap = new Map<string, IRoom[]>();

    if (!chatsMap.has(lowerCaseSearchTerm)) {
      const result = chats
        .filter((chat) => chat.name.toLowerCase().includes(lowerCaseSearchTerm))
        .sort((a, b) => b.usersCnt - a.usersCnt);

      chatsMap.set(lowerCaseSearchTerm, result);
    }

    return chatsMap.get(lowerCaseSearchTerm) || [];
  }, [chats, searchTerm]);

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
          dispatch(setActiveModal(MODAL_TYPES.PROFILE));
          console.log('Profile clicked');
        },
      },
      {
        label: 'Settings',
        icon: null,
        onClick: () => {
          dispatch(setActiveModal(MODAL_TYPES.SETTINGS));
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
        style={{
          ...config?.roomListStyles,
          ...(isSmallScreen ? { width: '100%' } : {}),
        }}
      >
        {(open || !burgerMenu) && (
          <ScollableContainer>
            <SearchContainer>
              <DropdownMenu
                options={menuOptions}
                // onClose={dispatch(setActiveModal())}
              />
              <SearchInput
                icon={<SearchIcon height={'20px'} />}
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Search..."
                // animated={true}
              />

              <NewChatModal />
            </SearchContainer>
            <div style={{ flexGrow: 1, overflowY: 'auto' }}>
              {filteredChats.map((chat: IRoom, index: React.Key) => (
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
                      <ProfileImagePlaceholder
                        name={chat.name}
                        icon={chat?.icon}
                      />
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
