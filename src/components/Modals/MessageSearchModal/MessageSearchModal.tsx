import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import {
  requestJumpToMessage,
  setCurrentRoom,
} from '../../../roomStore/roomsSlice';
import { setActiveModal } from '../../../roomStore/chatSettingsSlice';
import { MessageSearchHit } from '../../../networking/api-requests/messageSearch.api';
import { SearchIcon } from '../../../assets/icons';
import { useT } from '../../../i18n/useT';
import { useIsMobileViewport } from '../../../hooks/useIsMobileViewport';
import SideDrawer, {
  DrawerHint,
  DrawerSearchBar,
  DrawerSearchInput,
} from '../SideDrawer/SideDrawer';
import { buildSnippet } from './snippet';
import { resolveSender } from './resolveSender';
import {
  MIN_QUERY_LENGTH,
  SearchScope,
  useMessageSearch,
} from './useMessageSearch';

interface MessageSearchModalProps {
  handleCloseModal: () => void;
}

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--ethora-space-3, 12px);
  min-height: 0;
`;

const ScopeRow = styled.div`
  display: flex;
  gap: var(--ethora-space-2, 8px);
`;

const ScopeButton = styled.button<{ $active: boolean }>`
  flex: 1 1 0;
  height: 32px;
  border: 1px solid
    ${({ $active }) =>
      $active
        ? 'var(--ethora-color-primary, #0052cd)'
        : 'var(--ethora-color-border, #e6e8ec)'};
  border-radius: var(--ethora-radius-full, 999px);
  background: ${({ $active }) =>
    $active ? 'var(--ethora-color-primary-soft, #e7edf9)' : 'transparent'};
  color: ${({ $active }) =>
    $active
      ? 'var(--ethora-color-primary-text, #0052cd)'
      : 'var(--ethora-color-text-secondary, #5a5f66)'};
  font: inherit;
  font-size: var(--ethora-font-size-sm, 14px);
  font-weight: var(--ethora-font-weight-medium, 500);
  cursor: pointer;
  transition: background-color var(--ethora-motion-fast, 150ms);
`;

const ResultsMeta = styled.div`
  font-size: var(--ethora-font-size-xs, 12px);
  color: var(--ethora-color-text-muted, #6c6c6c);
`;

const ResultList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
`;

const ResultButton = styled.button`
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: var(--ethora-space-2, 8px) var(--ethora-space-3, 12px);
  border: none;
  border-radius: var(--ethora-radius-sm, 8px);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;

  &:hover:not(:disabled),
  &:focus-visible {
    background: var(--ethora-color-bg-hover, #f0f2f5);
  }
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

const ResultHead = styled.div`
  display: flex;
  justify-content: space-between;
  gap: var(--ethora-space-2, 8px);
  font-size: var(--ethora-font-size-xs, 12px);
  color: var(--ethora-color-text-muted, #6c6c6c);

  > span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--ethora-font-weight-medium, 500);
    color: var(--ethora-color-text-secondary, #5a5f66);
  }
  > span:last-child {
    flex: 0 0 auto;
  }
`;

const Snippet = styled.div`
  font-size: var(--ethora-font-size-sm, 14px);
  line-height: 1.4;
  color: var(--ethora-color-text, #141414);
  overflow-wrap: anywhere;

  mark {
    background: var(--ethora-color-primary-soft, #e7edf9);
    color: var(--ethora-color-primary-text, #0052cd);
    border-radius: 3px;
    padding: 0 1px;
  }
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

const formatWhen = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
    }).format(date);
  } catch {
    return date.toDateString();
  }
};

const MessageSearchModal: React.FC<MessageSearchModalProps> = ({
  handleCloseModal,
}) => {
  const t = useT();
  const dispatch = useDispatch();
  const isMobile = useIsMobileViewport(767);
  const inputRef = useRef<HTMLInputElement>(null);

  const rooms = useSelector((state: RootState) => state.rooms.rooms);
  const activeRoomJID = useSelector(
    (state: RootState) => state.rooms.activeRoomJID
  );
  const usersSet = useSelector((state: RootState) => state.rooms.usersSet);
  const myXmppUsername = useSelector(
    (state: RootState) => state.chatSettingStore.user?.xmppUsername
  );

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>(
    activeRoomJID ? 'chat' : 'all'
  );
  const roomName = activeRoomJID ? activeRoomJID.split('@')[0] : undefined;

  const search = useMessageSearch(query, scope, roomName);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const senderName = (hit: MessageSearchHit): string => {
    const room = rooms[hit.room];
    const { name, isSelf } = resolveSender(hit, {
      usersSet: usersSet as Record<string, any>,
      members: room?.members as any[],
      myXmppUsername,
    });
    if (isSelf) return t('search.messages.you');
    return name || t('search.messages.someone');
  };

  const open = (hit: MessageSearchHit) => {
    const roomJID = rooms[hit.room]
      ? hit.room
      : Object.keys(rooms).find((jid) => jid.split('@')[0] === hit.chatId);
    if (!roomJID) return;
    if (roomJID !== activeRoomJID) dispatch(setCurrentRoom({ roomJID }));
    dispatch(
      requestJumpToMessage({
        roomJID,
        ids: [hit.stanzaId, hit.messageId],
      })
    );
    // Phones show one pane at a time, so the panel would hide the very
    // message the tap asked for. Desktop keeps it open beside the chat, so
    // the next hit is one click away.
    if (isMobile) dispatch(setActiveModal(undefined));
  };

  const hits = useMemo(() => search.items, [search.items]);
  const trimmed = query.trim();

  return (
    <SideDrawer
      title={t('search.messages.title')}
      onClose={handleCloseModal}
      backLabel={t('action.close')}
    >
      <Stack>
        <DrawerSearchBar>
          <SearchIcon />
          <DrawerSearchInput
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(
              scope === 'chat'
                ? 'search.messages.placeholderChat'
                : 'search.messages.placeholderAll'
            )}
            aria-label={t('search.messages.title')}
          />
        </DrawerSearchBar>

        <ScopeRow role="group" aria-label={t('search.messages.scope')}>
          <ScopeButton
            type="button"
            $active={scope === 'chat'}
            aria-pressed={scope === 'chat'}
            disabled={!roomName}
            onClick={() => setScope('chat')}
          >
            {t('search.messages.scopeChat')}
          </ScopeButton>
          <ScopeButton
            type="button"
            $active={scope === 'all'}
            aria-pressed={scope === 'all'}
            onClick={() => setScope('all')}
          >
            {t('search.messages.scopeAll')}
          </ScopeButton>
        </ScopeRow>

        {!search.searchable && (
          <DrawerHint>
            {trimmed
              ? t('search.messages.tooShort', { count: MIN_QUERY_LENGTH })
              : t('search.messages.hint')}
          </DrawerHint>
        )}

        {search.searchable && search.status === 'loading' && (
          <DrawerHint role="status">
            {t('search.messages.searching')}
          </DrawerHint>
        )}

        {search.status === 'error' && (
          <DrawerHint role="alert">
            {t('search.messages.error')}{' '}
            <button type="button" onClick={search.retry}>
              {t('search.messages.retry')}
            </button>
          </DrawerHint>
        )}

        {search.searchable && search.status === 'done' && hits.length === 0 && (
          <DrawerHint>{t('search.messages.empty')}</DrawerHint>
        )}

        {hits.length > 0 && (
          <>
            <ResultsMeta role="status">
              {t('search.messages.count', { count: search.total })}
            </ResultsMeta>
            <ResultList>
              {hits.map((hit) => {
                const room = rooms[hit.room];
                const reachable = Boolean(
                  room ||
                    Object.keys(rooms).some(
                      (jid) => jid.split('@')[0] === hit.chatId
                    )
                );
                return (
                  <li key={`${hit.chatId}:${hit.stanzaId || hit.messageId}`}>
                    <ResultButton
                      type="button"
                      disabled={!reachable}
                      onClick={() => open(hit)}
                    >
                      <ResultHead>
                        <span>
                          {scope === 'all'
                            ? `${room?.title || t('search.messages.chat')} · ${senderName(hit)}`
                            : senderName(hit)}
                        </span>
                        <span>{formatWhen(hit.createdAt)}</span>
                      </ResultHead>
                      <Snippet>
                        {buildSnippet(hit.body, trimmed).map((part, index) =>
                          part.match ? (
                            <mark key={index}>{part.text}</mark>
                          ) : (
                            <React.Fragment key={index}>
                              {part.text}
                            </React.Fragment>
                          )
                        )}
                      </Snippet>
                    </ResultButton>
                  </li>
                );
              })}
            </ResultList>
            {search.hasMore && (
              <MoreButton
                type="button"
                onClick={search.loadMore}
                disabled={search.status === 'loadingMore'}
              >
                {search.status === 'loadingMore'
                  ? t('search.messages.searching')
                  : t('search.messages.loadMore')}
              </MoreButton>
            )}
          </>
        )}
      </Stack>
    </SideDrawer>
  );
};

export default MessageSearchModal;
