import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { IRoom } from '../../types/types';
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
  Container,
  Divider,
  ScollableContainer,
  SearchContainer,
} from '../styled/RoomListComponents';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { useXmppClient } from '../../context/xmppProvider';
import ChatRoomItem from '../RoomComponents/ChatRoomItem';
import { useChatSettingState } from '../../hooks/useChatSettingState';

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
  const { client, setClient } = useXmppClient();
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const dispatch = useDispatch();

  const { config } = useChatSettingState();

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

  const handleLogout = useCallback(async () => {
    if (client) {
      await client.close();
      setClient(null);
    }
    dispatch(setLogoutState());
    dispatch(logout());
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
          ...(isSmallScreen ? { width: '100%' } : { maxWidth: '432px' }),
        }}
      >
        {(open || !burgerMenu) && (
          <ScollableContainer>
            <SearchContainer>
              {!config?.disableRoomMenu && (
                <DropdownMenu
                  options={menuOptions}
                  // onClose={dispatch(setActiveModal())}
                />
              )}
              <SearchInput
                icon={<SearchIcon height={'20px'} />}
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Search..."
                // animated={true}
              />

              <NewChatModal />
            </SearchContainer>
            <div
              style={{ flexGrow: 1, overflowY: 'auto', padding: '16px 0px' }}
            >
              {filteredChats.map((chat: IRoom, index: number) => (
                <>
                  <ChatRoomItem
                    key={chat.id}
                    chat={chat}
                    index={index}
                    isChatActive={isChatActive(chat)}
                    performClick={performClick}
                    config={config}
                  />
                  {index < filteredChats.length - 1 && <Divider />}
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
