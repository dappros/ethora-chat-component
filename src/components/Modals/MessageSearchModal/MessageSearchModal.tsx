import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import {
  requestJumpToMessage,
  setCurrentRoom,
} from '../../../roomStore/roomsSlice';
import { setActiveModal } from '../../../roomStore/chatSettingsSlice';
import {
  hitKey,
  MessageSearchHit,
} from '../../../networking/api-requests/messageSearch.api';
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
  dayEndISO,
  dayStartISO,
  isBackwardsRange,
  matchPeople,
} from './searchFilters';
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

const FilterToggle = styled.button<{ $active: boolean }>`
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px;
  border: none;
  background: transparent;
  color: ${({ $active }) =>
    $active
      ? 'var(--ethora-color-primary-text, #0052cd)'
      : 'var(--ethora-color-text-secondary, #5a5f66)'};
  font: inherit;
  font-size: var(--ethora-font-size-sm, 14px);
  cursor: pointer;

  > span {
    min-width: 18px;
    padding: 0 5px;
    border-radius: var(--ethora-radius-full, 999px);
    background: var(--ethora-color-primary, #0052cd);
    color: var(--ethora-color-text-on-primary, #fff);
    font-size: var(--ethora-font-size-xs, 12px);
    text-align: center;
  }
`;

const FilterGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--ethora-space-2, 8px);
  padding: var(--ethora-space-3, 12px);
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  border-radius: var(--ethora-radius-md, 12px);
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--ethora-font-size-xs, 12px);
  color: var(--ethora-color-text-muted, #6c6c6c);

  input {
    height: 36px;
    box-sizing: border-box;
    padding: 0 10px;
    border: 1px solid var(--ethora-color-border, #e6e8ec);
    border-radius: var(--ethora-radius-sm, 8px);
    background: var(--ethora-color-bg-subtle, #f5f7fa);
    color: var(--ethora-color-text, #141414);
    font: inherit;
    font-size: var(--ethora-font-size-sm, 14px);
  }
`;

const DateRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ethora-space-2, 8px);
`;

const Suggestions = styled.ul`
  list-style: none;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  border-radius: var(--ethora-radius-sm, 8px);
  background: var(--ethora-color-bg, #fff);

  button {
    width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--ethora-color-text, #141414);
    font: inherit;
    font-size: var(--ethora-font-size-sm, 14px);
    text-align: start;
    cursor: pointer;
  }
  button:hover,
  button:focus-visible {
    background: var(--ethora-color-bg-hover, #f0f2f5);
  }
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 3px 4px 3px 10px;
  border-radius: var(--ethora-radius-full, 999px);
  background: var(--ethora-color-primary-soft, #e7edf9);
  color: var(--ethora-color-primary-text, #0052cd);
  font-size: var(--ethora-font-size-sm, 14px);

  button {
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    padding: 0 6px;
  }
`;

const ClearLink = styled.button`
  align-self: flex-start;
  border: none;
  background: transparent;
  color: var(--ethora-color-text-secondary, #5a5f66);
  font: inherit;
  font-size: var(--ethora-font-size-xs, 12px);
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
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

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sinceDay, setSinceDay] = useState('');
  const [untilDay, setUntilDay] = useState('');
  const [sender, setSender] = useState<{ id: string; name: string } | null>(
    null
  );
  const [senderQuery, setSenderQuery] = useState('');

  const backwards = isBackwardsRange(sinceDay, untilDay);
  // Memoised: the hook keys its request on these, and a fresh object per
  // render must not look like a changed filter.
  const filters = useMemo(
    () => ({
      fromUserId: sender?.id,
      since: backwards ? undefined : dayStartISO(sinceDay),
      until: backwards ? undefined : dayEndISO(untilDay),
    }),
    [sender?.id, sinceDay, untilDay, backwards]
  );
  const activeFilterCount =
    (sender ? 1 : 0) + (sinceDay ? 1 : 0) + (untilDay ? 1 : 0);
  const clearFilters = () => {
    setSender(null);
    setSenderQuery('');
    setSinceDay('');
    setUntilDay('');
  };

  // Who can be picked as the sender: this room's members, or everyone the
  // app knows when searching across chats.
  const senderCandidates = useMemo(() => {
    if (!senderQuery.trim()) return [];
    const people =
      scope === 'chat'
        ? ((activeRoomJID && rooms[activeRoomJID]?.members) as any[]) || []
        : Object.values(usersSet || {});
    return matchPeople(people as any[], senderQuery);
  }, [senderQuery, scope, rooms, activeRoomJID, usersSet]);

  // A backwards range has no honest result, so it searches nothing (and says
  // so) instead of quietly dropping the dates.
  const search = useMessageSearch(
    backwards ? '' : query,
    scope,
    roomName,
    filters
  );

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
        createdAt: hit.createdAt,
        body: hit.body,
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
            data-autofocus
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

        <FilterToggle
          type="button"
          $active={filtersOpen || activeFilterCount > 0}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          {t('search.messages.filters')}
          {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
        </FilterToggle>

        {filtersOpen && (
          <FilterGrid>
            <Field>
              {t('search.messages.filterSender')}
              {sender ? (
                <Chip>
                  {sender.name}
                  <button
                    type="button"
                    aria-label={t('search.messages.filterClear')}
                    onClick={() => setSender(null)}
                  >
                    {'\u00d7'}
                  </button>
                </Chip>
              ) : (
                <input
                  type="search"
                  value={senderQuery}
                  onChange={(event) => setSenderQuery(event.target.value)}
                  placeholder={t('search.messages.filterSenderPlaceholder')}
                />
              )}
            </Field>
            {!sender && senderCandidates.length > 0 && (
              <Suggestions role="listbox">
                {senderCandidates.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => {
                        setSender(person);
                        setSenderQuery('');
                      }}
                    >
                      {person.name}
                    </button>
                  </li>
                ))}
              </Suggestions>
            )}
            <DateRow>
              <Field>
                {t('search.messages.filterSince')}
                <input
                  type="date"
                  value={sinceDay}
                  max={untilDay || undefined}
                  onChange={(event) => setSinceDay(event.target.value)}
                />
              </Field>
              <Field>
                {t('search.messages.filterUntil')}
                <input
                  type="date"
                  value={untilDay}
                  min={sinceDay || undefined}
                  onChange={(event) => setUntilDay(event.target.value)}
                />
              </Field>
            </DateRow>
            {backwards && (
              <DrawerHint role="alert">
                {t('search.messages.dateOrder')}
              </DrawerHint>
            )}
            {activeFilterCount > 0 && (
              <ClearLink type="button" onClick={clearFilters}>
                {t('search.messages.filterClearAll')}
              </ClearLink>
            )}
          </FilterGrid>
        )}

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
                  <li key={hitKey(hit)}>
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
