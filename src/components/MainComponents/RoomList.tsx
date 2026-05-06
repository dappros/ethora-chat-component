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
import { setActiveModal } from '../../roomStore/chatSettingsSlice';
import NewChatModal from '../Modals/NewChatModal/NewChatModal';
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
import { logoutService } from '../../hooks/useLogout';
import { ethoraLogger } from '../../helpers/ethoraLogger';

interface RoomListProps {
  chats: IRoom[];
  burgerMenu?: boolean;
  onRoomClick?: (chat: IRoom) => void;
  isSmallScreen?: boolean;
}

const normalizeTimestampValue = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 1e11) return value * 1000;
  if (value > 1e14) return Math.floor(value / 1000);
  return value;
};

const getRoomActivityTimestamp = (chat: IRoom): number => {
  const latestMessage = chat?.messages?.[chat.messages.length - 1];
  const latestMessageDate = new Date(latestMessage?.date as string).getTime();

  if (Number.isFinite(latestMessageDate) && latestMessageDate > 0) {
    return latestMessageDate;
  }

  const lastMessageTimestamp = normalizeTimestampValue(
    Number(chat?.lastMessageTimestamp)
  );
  if (lastMessageTimestamp > 0) {
    return lastMessageTimestamp;
  }

  const latestMessageId = String(latestMessage?.id || '').trim();
  if (latestMessageId) {
    const normalizedId = normalizeTimestampValue(Number(latestMessageId));
    if (normalizedId > 0) {
      return normalizedId;
    }

    const numericChunk = latestMessageId.match(/\d{10,}/)?.[0];
    if (numericChunk) {
      const normalizedChunk = normalizeTimestampValue(Number(numericChunk));
      if (normalizedChunk > 0) {
        return normalizedChunk;
      }
    }
  }

  const createdAt = new Date(chat?.createdAt as string).getTime();
  if (Number.isFinite(createdAt) && createdAt > 0) {
    return createdAt;
  }

  return 0;
};

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
      if (chat.jid === activeRoomJID && !isSmallScreen) {
        return;
      }

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
      // Defensive: persisted Redux state can occasionally rehydrate a chats array that
      // contains null/undefined entries (stale shape, partially-applied migration, etc.).
      // Without the explicit Boolean filter, the next `chat.name?.toLowerCase()` throws
      // "Cannot read properties of null (reading 'name')" from inside Array.filter and
      // unwinds the whole router subtree.
      const safeChats = (chats || []).filter(
        (chat): chat is IRoom =>
          !!chat &&
          typeof chat === 'object' &&
          typeof chat.jid === 'string' &&
          chat.jid.length > 0
      );
      const result = safeChats
        .filter((chat) =>
          (chat.name || '').toLowerCase().includes(lowerCaseSearchTerm)
        )
        .sort((a, b) => {
          // Took main's getRoomActivityTimestamp helper (helpers/roomActivityScore.ts)
          // over tf-dev's inline getLastMessageId/createdAt fallback chain - main's
          // helper is the cleaner extraction and accounts for more activity signals.
          const aCompare = getRoomActivityTimestamp(a);
          const bCompare = getRoomActivityTimestamp(b);
          return bCompare - aCompare;
        });

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
    (room: IRoom) =>
      !isSmallScreen &&
      !!activeRoomJID &&
      !!room?.jid &&
      activeRoomJID === room.jid,
    [activeRoomJID, isSmallScreen]
  );

  const handleLogout = useCallback(async () => {
    if (client) {
      await client.close();
      setClient(null);
    }
    await logoutService.performLogout();
  }, [client, setClient]);

  const menuOptions = useMemo(
    () => [
      {
        label: 'Profile',
        icon: null,
        onClick: () => {
          dispatch(setActiveModal(MODAL_TYPES.PROFILE));
          ethoraLogger.log('Profile clicked');
        },
      },
      {
        label: 'Settings',
        icon: null,
        onClick: () => {
          dispatch(setActiveModal(MODAL_TYPES.SETTINGS));
          ethoraLogger.log('Settings clicked');
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
          flex: isSmallScreen ? 1 : '0 1 432px',
        }}
      >
        {(open || !burgerMenu) && (
          <ScollableContainer>
            {!config?.chatHeaderSettings?.hide && (
              <SearchContainer>
                {!config?.disableRoomMenu &&
                  !config?.chatHeaderSettings?.disableMenu && (
                    <DropdownMenu
                      options={menuOptions}
                      // onClose={dispatch(setActiveModal())}
                    />
                  )}
                {!config?.chatHeaderSettings?.hideSearch && (
                  <SearchInput
                    icon={<SearchIcon height={'20px'} />}
                    value={searchTerm}
                    onChange={handleSearchChange}
                    placeholder="Search..."
                    // animated={true}
                  />
                )}

                {!config?.chatHeaderSettings?.disableCreate && <NewChatModal />}
              </SearchContainer>
            )}
            <div
              style={{ flexGrow: 1, overflowY: 'auto', padding: '16px 0px' }}
            >
              {filteredChats.map((chat: IRoom, index: number) => (
                <React.Fragment key={`${chat.id}-${index}`}>
                  <ChatRoomItem
                    chat={chat}
                    index={index}
                    isChatActive={isChatActive(chat)}
                    performClick={performClick}
                    config={config}
                  />
                  {index < filteredChats.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </div>
          </ScollableContainer>
        )}
      </Container>
    </>
  );
};

export default RoomList;
