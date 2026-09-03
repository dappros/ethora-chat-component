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
  AnimatedRow,
  BurgerButton,
  Container,
  Divider,
  ScollableContainer,
  SearchContainer,
  SkeletonAvatar,
  SkeletonLine,
  SkeletonLines,
  SkeletonRow,
  TabButton,
  TabContent,
  TabIndicator,
  TabsContainer,
} from '../styled/RoomListComponents';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { useXmppClient } from '../../context/xmppProvider';
import ChatRoomItem from '../RoomComponents/ChatRoomItem';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { useT } from '../../i18n/useT';
import { isRoomHidden } from '../../helpers/hiddenRooms';
import { logoutService } from '../../hooks/useLogout';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import { deleteRoom, setCurrentRoom } from '../../roomStore/roomsSlice';
import { RoomListTestIds } from '../../testIds';
import FilesPanel from '../Files/FilesPanel';

const SKELETON_ROW_COUNT = 6;

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

const getRoomLabel = (chat: IRoom): string =>
  String(chat?.title || chat?.name || '').trim();

const isValidRoomRecord = (chat: unknown): chat is IRoom => {
  if (!chat || typeof chat !== 'object') return false;

  const room = chat as Partial<IRoom>;
  const jid = String(room.jid || '').trim();

  return Boolean(jid && getRoomLabel(room as IRoom));
};

const getRoomJid = (chat: unknown): string => {
  if (!chat || typeof chat !== 'object') return '';
  return String((chat as Partial<IRoom>).jid || '').trim();
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
  // Persisted in component state only, per spec - not synced to redux/config.
  const [activeTab, setActiveTab] = useState<'chats' | 'files'>('chats');

  const dispatch = useDispatch();

  const { config } = useChatSettingState();
  const t = useT();

  const activeRoomJID = useSelector(
    (state: RootState) => state.rooms.activeRoomJID
  );
  const isRoomsLoading = useSelector(
    (state: RootState) => state.rooms.isLoading
  );

  const filesTabEnabled = config?.filesTab?.enabled !== false;

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const invalidRoomJids = (chats || [])
      .filter((chat) => !isValidRoomRecord(chat))
      .map(getRoomJid)
      .filter(Boolean);

    if (!invalidRoomJids.length) return;

    invalidRoomJids.forEach((jid) => {
      dispatch(deleteRoom({ jid }));
    });

    if (activeRoomJID && invalidRoomJids.includes(activeRoomJID)) {
      const nextRoomJID =
        (chats || []).find(
          (chat) => isValidRoomRecord(chat) && chat.jid !== activeRoomJID
        )?.jid || null;

      dispatch(setCurrentRoom({ roomJID: nextRoomJID }));
    }
  }, [activeRoomJID, chats, dispatch]);

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
          chat.jid.length > 0 &&
          !isRoomHidden(chat, config)
      );
      const result = safeChats
        .filter((chat) =>
          getRoomLabel(chat).toLowerCase().includes(lowerCaseSearchTerm)
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
  }, [chats, searchTerm, config?.hiddenRooms]);

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
      ...(!config?.disableProfilesInteractions
        ? [
            {
              label: 'Settings',
              icon: null,
              onClick: () => {
                dispatch(setActiveModal(MODAL_TYPES.SETTINGS));
                ethoraLogger.log('Settings clicked');
              },
            },
          ]
        : []),
      {
        label: 'Logout',
        icon: null,
        onClick: () => handleLogout(),
      },
    ],
    [config?.disableProfilesInteractions]
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
          ...(isSmallScreen ? { width: '100%' } : { width: '432px' }),
          flex: isSmallScreen ? 1 : '0 0 432px',
        }}
      >
        {(open || !burgerMenu) && (
          <ScollableContainer>
            {filesTabEnabled && (
              <TabsContainer
                role="tablist"
                aria-label={t('tabs.label')}
                onKeyDown={(e) => {
                  // Roving tabindex: arrows move between tabs, Tab leaves the list.
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                  e.preventDefault();
                  const next = activeTab === 'chats' ? 'files' : 'chats';
                  setActiveTab(next);
                  (
                    e.currentTarget.querySelector(`#ethora-${next}-tab`) as HTMLElement | null
                  )?.focus();
                }}
              >
                <TabIndicator $index={activeTab === 'chats' ? 0 : 1} $count={2} />
                <TabButton
                  type="button"
                  role="tab"
                  id="ethora-chats-tab"
                  aria-controls="ethora-chats-tabpanel"
                  aria-selected={activeTab === 'chats'}
                  tabIndex={activeTab === 'chats' ? 0 : -1}
                  active={activeTab === 'chats'}
                  onClick={() => setActiveTab('chats')}
                >
                  {t('tabs.chats')}
                </TabButton>
                <TabButton
                  type="button"
                  role="tab"
                  id="ethora-files-tab"
                  aria-controls="ethora-files-tabpanel"
                  aria-selected={activeTab === 'files'}
                  tabIndex={activeTab === 'files' ? 0 : -1}
                  active={activeTab === 'files'}
                  onClick={() => setActiveTab('files')}
                >
                  {t('tabs.files')}
                </TabButton>
              </TabsContainer>
            )}

            {activeTab === 'files' && filesTabEnabled ? (
              <TabContent
                key="files"
                role="tabpanel"
                id="ethora-files-tabpanel"
                aria-labelledby="ethora-files-tab"
              >
                <FilesPanel />
              </TabContent>
            ) : (
              <TabContent
                key="chats"
                role="tabpanel"
                id="ethora-chats-tabpanel"
                aria-labelledby="ethora-chats-tab"
              >
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
                        colorBg={config?.colors?.colorInput}
                        value={searchTerm}
                        onChange={handleSearchChange}
                        placeholder={t('search.placeholder')}
                        data-testid={RoomListTestIds.searchInput}
                        // animated={true}
                      />
                    )}

                    {!config?.chatHeaderSettings?.disableCreate && (
                      <NewChatModal />
                    )}
                  </SearchContainer>
                )}
                <div
                  data-testid={RoomListTestIds.roomsList}
                  style={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    scrollbarGutter: 'stable',
                    padding: '16px 0px',
                  }}
                >
                  {isRoomsLoading && filteredChats.length === 0
                    ? Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
                        <SkeletonRow key={`skeleton-${i}`}>
                          <SkeletonAvatar />
                          <SkeletonLines>
                            <SkeletonLine $width="45%" />
                            <SkeletonLine $width="70%" />
                          </SkeletonLines>
                        </SkeletonRow>
                      ))
                    : filteredChats.map((chat: IRoom, index: number) => (
                        <React.Fragment key={chat.jid || `${chat.id}-${index}`}>
                          <AnimatedRow $delay={index * 24}>
                            <ChatRoomItem
                              chat={chat}
                              index={index}
                              isChatActive={isChatActive(chat)}
                              performClick={performClick}
                              config={config}
                            />
                          </AnimatedRow>
                          {index < filteredChats.length - 1 && <Divider />}
                        </React.Fragment>
                      ))}
                </div>
              </TabContent>
            )}
          </ScollableContainer>
        )}
      </Container>
    </>
  );
};

export default RoomList;
