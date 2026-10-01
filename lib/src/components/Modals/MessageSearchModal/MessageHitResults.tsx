import React from 'react';
import styled from 'styled-components';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import {
  requestJumpToMessage,
  setCurrentRoom,
} from '../../../roomStore/roomsSlice';
import {
  hitKey,
  MessageSearchHit,
} from '../../../networking/api-requests/messageSearch.api';
import { useT } from '../../../i18n/useT';
import { buildSnippet } from './snippet';
import { resolveSender } from './resolveSender';

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

/**
 * What a tap on a search hit does, shared by the search panel and the room
 * list's search box: switch to the hit's room and ask it to scroll to, load
 * and flash the message.
 */
export function useMessageHitActions() {
  const t = useT();
  const dispatch = useDispatch();
  const rooms = useSelector((state: RootState) => state.rooms.rooms);
  const activeRoomJID = useSelector(
    (state: RootState) => state.rooms.activeRoomJID
  );
  const usersSet = useSelector((state: RootState) => state.rooms.usersSet);
  const myXmppUsername = useSelector(
    (state: RootState) => state.chatSettingStore.user?.xmppUsername
  );

  const roomJIDOf = (hit: MessageSearchHit): string | undefined =>
    rooms[hit.room]
      ? hit.room
      : Object.keys(rooms).find((jid) => jid.split('@')[0] === hit.chatId);

  const senderName = (hit: MessageSearchHit): string => {
    const { name, isSelf } = resolveSender(hit, {
      usersSet: usersSet as Record<string, any>,
      members: rooms[hit.room]?.members as any[],
      myXmppUsername,
    });
    if (isSelf) return t('search.messages.you');
    return name || t('search.messages.someone');
  };

  const open = (hit: MessageSearchHit): boolean => {
    const roomJID = roomJIDOf(hit);
    if (!roomJID) return false;
    if (roomJID !== activeRoomJID) dispatch(setCurrentRoom({ roomJID }));
    dispatch(
      requestJumpToMessage({
        roomJID,
        ids: [hit.stanzaId, hit.messageId],
        createdAt: hit.createdAt,
        body: hit.body,
        preview: {
          roomJID,
          sender: senderName(hit),
          body: hit.body,
          createdAt: hit.createdAt,
        },
      })
    );
    return true;
  };

  return {
    rooms,
    senderName,
    open,
    isReachable: (hit: MessageSearchHit) => Boolean(roomJIDOf(hit)),
  };
}

interface MessageHitListProps {
  hits: MessageSearchHit[];
  query: string;
  /** Prefix each row with its chat's title (search across chats). */
  showRoom: boolean;
  onOpen: (hit: MessageSearchHit) => void;
}

export const MessageHitList: React.FC<MessageHitListProps> = ({
  hits,
  query,
  showRoom,
  onOpen,
}) => {
  const t = useT();
  const { rooms, senderName, isReachable } = useMessageHitActions();
  return (
    <ResultList>
      {hits.map((hit) => (
        <li key={hitKey(hit)}>
          <ResultButton
            type="button"
            disabled={!isReachable(hit)}
            onClick={() => onOpen(hit)}
          >
            <ResultHead>
              <span>
                {showRoom
                  ? `${rooms[hit.room]?.title || t('search.messages.chat')} · ${senderName(hit)}`
                  : senderName(hit)}
              </span>
              <span>{formatWhen(hit.createdAt)}</span>
            </ResultHead>
            <Snippet>
              {buildSnippet(hit.body, query).map((part, index) =>
                part.match ? (
                  <mark key={index}>{part.text}</mark>
                ) : (
                  <React.Fragment key={index}>{part.text}</React.Fragment>
                )
              )}
            </Snippet>
          </ResultButton>
        </li>
      ))}
    </ResultList>
  );
};
