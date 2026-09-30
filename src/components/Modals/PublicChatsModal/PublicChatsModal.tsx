import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { setCurrentRoom } from '../../../roomStore/roomsSlice';
import { setActiveModal } from '../../../roomStore/chatSettingsSlice';
import {
  getPublicChats,
  PublicChat,
} from '../../../networking/api-requests/publicChats.api';
import { SearchIcon } from '../../../assets/icons';
import { useT } from '../../../i18n/useT';
import { useIsMobileViewport } from '../../../hooks/useIsMobileViewport';
import SideDrawer, {
  DrawerHint,
  DrawerSearchBar,
  DrawerSearchInput,
} from '../SideDrawer/SideDrawer';

interface PublicChatsModalProps {
  handleCloseModal: () => void;
}

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
`;

const Row = styled.li`
  display: flex;
  align-items: center;
  gap: var(--ethora-space-3, 12px);
  padding: var(--ethora-space-2, 8px) var(--ethora-space-1, 4px);
`;

const Avatar = styled.div<{ $src?: string }>`
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border-radius: var(--ethora-radius-full, 999px);
  background: ${({ $src }) =>
    $src
      ? `center / cover no-repeat url("${$src.replace(/"/g, '%22')}")`
      : 'var(--ethora-color-primary-soft, #e7edf9)'};
  color: var(--ethora-color-primary-text, #0052cd);
  font-weight: var(--ethora-font-weight-semibold, 600);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Text = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: start;

  > strong {
    font-size: var(--ethora-font-size-sm, 14px);
    font-weight: var(--ethora-font-weight-medium, 500);
    color: var(--ethora-color-text, #141414);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  > span {
    font-size: var(--ethora-font-size-xs, 12px);
    color: var(--ethora-color-text-muted, #6c6c6c);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const Action = styled.button<{ $open: boolean }>`
  flex: 0 0 auto;
  padding: 6px 14px;
  border-radius: var(--ethora-radius-full, 999px);
  border: 1px solid var(--ethora-color-primary, #0052cd);
  background: ${({ $open }) =>
    $open ? 'transparent' : 'var(--ethora-color-primary, #0052cd)'};
  color: ${({ $open }) =>
    $open
      ? 'var(--ethora-color-primary-text, #0052cd)'
      : 'var(--ethora-color-text-on-primary, #fff)'};
  font: inherit;
  font-size: var(--ethora-font-size-sm, 14px);
  font-weight: var(--ethora-font-weight-medium, 500);
  cursor: pointer;
`;

const MoreButton = styled.button`
  align-self: center;
  margin-top: var(--ethora-space-2, 8px);
  padding: 6px 14px;
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  border-radius: var(--ethora-radius-full, 999px);
  background: transparent;
  color: var(--ethora-color-text-secondary, #5a5f66);
  font: inherit;
  font-size: var(--ethora-font-size-sm, 14px);
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const initialOf = (chat: PublicChat) =>
  (chat.title || chat.name).trim().charAt(0).toUpperCase() || '#';

/**
 * A directory of the app's public chats (GET /v1/chats/public), so finding a
 * chat to join no longer needs someone to hand over a link or a QR code.
 *
 * Joining reuses what a shared link already does: selecting a room you are
 * not in makes the room initialiser join it and refresh the room list.
 */
const PublicChatsModal: React.FC<PublicChatsModalProps> = ({
  handleCloseModal,
}) => {
  const t = useT();
  const dispatch = useDispatch();
  const isMobile = useIsMobileViewport(767);
  const rooms = useSelector((state: RootState) => state.rooms.rooms);
  const conference = useSelector(
    (state: RootState) =>
      state.chatSettingStore.config?.xmppSettings?.conference
  );

  const [items, setItems] = useState<PublicChat[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState(0);
  const [status, setStatus] = useState<
    'loading' | 'loadingMore' | 'done' | 'error'
  >('loading');
  const [filter, setFilter] = useState('');
  const requestRef = useRef(0);

  const load = useCallback(async (offset: number) => {
    const id = ++requestRef.current;
    setStatus(offset ? 'loadingMore' : 'loading');
    try {
      const page = await getPublicChats({ offset });
      if (id !== requestRef.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((chat) => chat.name));
        return offset
          ? [...prev, ...page.items.filter((c) => !seen.has(c.name))]
          : page.items;
      });
      setTotal(page.total);
      setNextOffset(page.nextOffset);
      setStatus('done');
    } catch {
      if (id === requestRef.current) setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load(0);
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  const joined = useMemo(
    () => new Set(Object.keys(rooms).map((jid) => jid.split('@')[0])),
    [rooms]
  );

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (chat) =>
        chat.title.toLowerCase().includes(needle) ||
        chat.description.toLowerCase().includes(needle)
    );
  }, [items, filter]);

  const open = (chat: PublicChat) => {
    const domain = (conference || '').trim();
    // Without a conference domain there is no correct JID to build, the same
    // rule chatAutoEnterer follows for a shared link.
    if (!domain) return;
    dispatch(setCurrentRoom({ roomJID: `${chat.name}@${domain}` }));
    if (isMobile) dispatch(setActiveModal(undefined));
  };

  const hasMore = nextOffset < total;

  return (
    <SideDrawer
      title={t('publicChats.title')}
      onClose={handleCloseModal}
      backLabel={t('action.close')}
    >
      <DrawerSearchBar>
        <SearchIcon />
        <DrawerSearchInput
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t('publicChats.filter')}
          aria-label={t('publicChats.filter')}
        />
      </DrawerSearchBar>

      {status === 'loading' && (
        <DrawerHint role="status">{t('publicChats.loading')}</DrawerHint>
      )}
      {status === 'error' && (
        <DrawerHint role="alert">
          {t('publicChats.error')}{' '}
          <button type="button" onClick={() => void load(nextOffset)}>
            {t('search.messages.retry')}
          </button>
        </DrawerHint>
      )}
      {status !== 'loading' && status !== 'error' && visible.length === 0 && (
        <DrawerHint>
          {filter.trim() && hasMore
            ? t('publicChats.emptyFilterMore')
            : t('publicChats.empty')}
        </DrawerHint>
      )}

      {visible.length > 0 && (
        <List>
          {visible.map((chat) => {
            const isJoined = joined.has(chat.name);
            return (
              <Row key={chat.name}>
                <Avatar $src={chat.picture} aria-hidden="true">
                  {!chat.picture && initialOf(chat)}
                </Avatar>
                <Text>
                  <strong>{chat.title || t('search.messages.chat')}</strong>
                  {chat.description && <span>{chat.description}</span>}
                </Text>
                <Action
                  type="button"
                  $open={isJoined}
                  onClick={() => open(chat)}
                >
                  {t(isJoined ? 'publicChats.open' : 'publicChats.join')}
                </Action>
              </Row>
            );
          })}
        </List>
      )}

      {hasMore && status !== 'loading' && status !== 'error' && (
        <MoreButton
          type="button"
          disabled={status === 'loadingMore'}
          onClick={() => void load(nextOffset)}
        >
          {status === 'loadingMore'
            ? t('search.messages.searching')
            : t('search.messages.loadMore')}
        </MoreButton>
      )}
    </SideDrawer>
  );
};

export default PublicChatsModal;
