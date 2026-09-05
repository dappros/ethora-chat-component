import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
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
import { useFilesEndpointSupport } from '../../hooks/useFilesEndpointSupport';

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

  // Explicit `true` always shows the tab (the host takes responsibility for
  // it existing). Explicit `false` always hides it. When left unset, the tab
  // is shown optimistically until the backend proves it doesn't have
  // /v2/files - see useFilesEndpointSupport / files.api.ts for the probe.
  const filesEndpointSupport = useFilesEndpointSupport();
  const filesTabConfigured = config?.filesTab?.enabled;
  const filesTabEnabled =
    filesTabConfigured === true ||
    (filesTabConfigured !== false && filesEndpointSupport !== 'unsupported');

  const containerRef = useRef<HTMLDivElement>(null);

  // Rows animate in once, ever, per jid - not once per position. Sorting by
  // activity means a single incoming message can shift every other row's
  // index, and styled-components regenerates the AnimatedRow class whenever
  // its computed $delay changes, which restarts the CSS animation on any
  // element whose class swaps - even ones whose content didn't change. So
  // the stagger delay is assigned once, the first time a jid is ever seen
  // (using an incrementing "first-seen" counter, not the current sort
  // index), and recorded here; every later render for that jid renders with
  // $skipAnimation regardless of where it now sits in the sorted list or
  // whether a search filter temporarily hid it.
  const animatedJidsRef = useRef<Map<string, number>>(new Map());

  // FLIP (First-Last-Invert-Play) repositioning: when a room's rank changes
  // (a new message bumps it up, or a neighbor's bump pushes it down), the
  // row should slide to its new spot instead of snapping. `rowElementsRef`
  // holds the live DOM node per jid, `rowPositionsRef` holds each jid's
  // viewport-relative top from the LAST time we measured, and `roomsListRef`
  // + `prevScrollTopRef` let us discount plain scrolling (which shifts every
  // row's bounding rect by the same amount and must never be read as a
  // reorder). `hasMeasuredRef` skips the very first measurement - there is
  // no "previous position" to FLIP from on initial mount.
  const rowElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const rowPositionsRef = useRef<Map<string, number>>(new Map());
  const roomsListRef = useRef<HTMLDivElement>(null);
  const prevScrollTopRef = useRef(0);
  const hasMeasuredRef = useRef(false);
  // A row's release (the animated return to translateY(0)) is scheduled via
  // rAF, which can be delayed well past the next resort - a backgrounded
  // tab throttles rAF, and two messages arriving close together can each
  // trigger their own resort inside that window. Tracking the pending
  // frame per jid lets a new resort cancel a stale release before it fires
  // - otherwise that stale callback can clobber a newer, still-animating
  // invert and snap the row to rest mid-flight.
  const pendingReleaseFramesRef = useRef<Map<string, number>>(new Map());

  // Cache one stable ref-callback per jid (rather than a fresh closure every
  // render) so React doesn't churn rowElementsRef's entries - detach then
  // reattach the same node - on every re-render that doesn't actually
  // change which row a jid maps to.
  const rowRefCallbacksRef = useRef<Map<string, (el: HTMLDivElement | null) => void>>(
    new Map()
  );

  const getRowElementRef = useCallback((jid: string) => {
    let cb = rowRefCallbacksRef.current.get(jid);
    if (!cb) {
      cb = (el: HTMLDivElement | null) => {
        if (el) {
          rowElementsRef.current.set(jid, el);
        } else {
          rowElementsRef.current.delete(jid);
        }
      };
      rowRefCallbacksRef.current.set(jid, cb);
    }
    return cb;
  }, []);

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

  useEffect(() => {
    // If the Files tab was active and then gets hidden (config flips, or the
    // endpoint probe comes back unsupported), don't leave the user staring
    // at a dead tab panel - fall back to Chats.
    if (!filesTabEnabled && activeTab === 'files') {
      setActiveTab('chats');
    }
  }, [filesTabEnabled, activeTab]);

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

  // Runs after the DOM has committed the new sort order. Measures each
  // row's new position, compares it against where it was last measured, and
  // - for rows that were already on screen (not a fresh entrance) - snaps
  // it back to the old spot with no transition, then releases it into a
  // transitioned translateY(0) on the next frame so the browser animates
  // the slide. Only jids present in BOTH the previous and current position
  // maps are FLIPped: a genuinely new row has no previous position to FLIP
  // from, so it naturally falls through to the entrance animation instead.
  useLayoutEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const previousPositions = rowPositionsRef.current;
    const nextPositions = new Map<string, number>();

    const currentScrollTop = roomsListRef.current?.scrollTop ?? 0;
    const scrollDelta = currentScrollTop - prevScrollTopRef.current;

    filteredChats.forEach((chat, index) => {
      const jid = chat.jid || `${chat.id}-${index}`;
      const el = rowElementsRef.current.get(jid);
      if (!el) return;

      // A previous resort's release may not have run yet (rAF can lag well
      // behind a fast-arriving second message). If we measured while that
      // stale invert transform was still applied, getBoundingClientRect()
      // would report a wildly wrong position (the row's real layout spot
      // shifted by whatever transform is still sitting on it), and every
      // delta computed from it would compound that error. Cancel any
      // not-yet-fired release and snap the row back to its neutral layout
      // position first, so this measurement is always the true post-layout
      // top - exactly what FLIP's "Last" measurement is supposed to be.
      const pendingFrame = pendingReleaseFramesRef.current.get(jid);
      if (pendingFrame !== undefined) {
        cancelAnimationFrame(pendingFrame);
        pendingReleaseFramesRef.current.delete(jid);
      }
      if (el.style.transform || el.style.transition) {
        el.style.transition = 'none';
        el.style.transform = '';
      }

      const newTop = el.getBoundingClientRect().top;
      nextPositions.set(jid, newTop);

      if (!hasMeasuredRef.current || prefersReducedMotion) return;

      const oldTop = previousPositions.get(jid);
      if (oldTop === undefined) return;

      // Discount pure scrolling: a scroll shifts every row's bounding rect
      // by the same amount, which isn't a reorder.
      const delta = oldTop - newTop - scrollDelta;
      if (!delta) return;

      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      // Force layout so the browser commits the inverted position above
      // before the rAF below flips it back with a transition - otherwise
      // both style writes get batched into one paint and nothing animates.
      el.getBoundingClientRect();

      const frameId = requestAnimationFrame(() => {
        pendingReleaseFramesRef.current.delete(jid);
        el.style.transition =
          'transform var(--ethora-motion-base, 220ms) var(--ethora-motion-ease, cubic-bezier(.2,.8,.2,1))';
        el.style.transform = '';
      });
      pendingReleaseFramesRef.current.set(jid, frameId);
    });

    rowPositionsRef.current = nextPositions;
    prevScrollTopRef.current = currentScrollTop;
    hasMeasuredRef.current = true;
  }, [filteredChats]);

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
                  ref={roomsListRef}
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
                    : filteredChats.map((chat: IRoom, index: number) => {
                        const isLast = index === filteredChats.length - 1;
                        // The active row has its own rounded, tinted
                        // highlight box; a straight hairline divider flush
                        // against its top/bottom edge cut across the
                        // rounded corners and looked like it was leaking out
                        // of the row. Hide (not skip - see Divider's
                        // $hidden) the divider on either side of the active
                        // row - the highlight itself already separates it
                        // from its neighbors, and hiding rather than
                        // omitting the divider keeps every row pair's
                        // stacked height identical, so switching the active
                        // room never shifts the rows below it.
                        const adjacentToActiveRow =
                          isChatActive(chat) ||
                          (!isLast && isChatActive(filteredChats[index + 1]));

                        const jid = chat.jid || `${chat.id}-${index}`;
                        const animatedJids = animatedJidsRef.current;
                        let skipAnimation = true;
                        let delay = 0;
                        if (animatedJids.has(jid)) {
                          delay = animatedJids.get(jid) as number;
                        } else {
                          // First time this jid has ever been rendered:
                          // assign it the next stagger slot and remember it
                          // so future renders (resorts, filter changes)
                          // never animate it again.
                          delay = animatedJids.size * 24;
                          animatedJids.set(jid, delay);
                          skipAnimation = false;
                        }

                        return (
                          <React.Fragment key={jid}>
                            <AnimatedRow
                              ref={getRowElementRef(jid)}
                              $delay={delay}
                              $skipAnimation={skipAnimation}
                            >
                              <ChatRoomItem
                                chat={chat}
                                isChatActive={isChatActive(chat)}
                                performClick={performClick}
                                config={config}
                              />
                            </AnimatedRow>
                            {!isLast && <Divider $hidden={adjacentToActiveRow} />}
                          </React.Fragment>
                        );
                      })}
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
