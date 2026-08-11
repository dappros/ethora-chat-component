import React, { useCallback, useMemo } from 'react';
import { IConfig, IMessage, IRoom, LastMessage } from '../../types/types';
import { ProfileImagePlaceholder } from '../MainComponents/ProfileImagePlaceholder';
import {
  ChatItem,
  ChatInfo,
  ChatName,
  UserCount,
} from '../styled/RoomListComponents';
import Composing from '../styled/StyledInputComponents/Composing';
import {
  LastRoomMessageText,
  NewMessageMarker,
} from './styled/StyledRoomComponents';
import LastMessageItem from './LastMessageItem';
import { useRoomPresence } from '../../hooks/useRoomPresence';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import { useT } from '../../i18n/useT';
import OnlineUsersPopover from './OnlineUsersPopover';
import { useSelector } from 'react-redux';
import { RootState } from '../../roomStore';
import { formatCallLogLabel } from '../../helpers/callLogMessage';
import { appendFileToken } from '../../helpers/secureFileUrl';

interface ChatRoomItemProps {
  chat: IRoom;
  index: number;
  isChatActive: boolean;
  performClick: (chat: IRoom) => void;
  config: IConfig;
}

const ChatRoomItem: React.FC<ChatRoomItemProps> = ({
  chat,
  index,
  isChatActive,
  performClick,
  config,
}) => {
  const displayName = String(chat?.title || chat?.name || '').trim();

  // For 1:1 rooms, light the peer's avatar when they have an available presence
  // in this room. (Only populated for rooms whose occupant presence we receive.)
  const onlineUsers = useRoomPresence(chat?.jid);
  const { user: stateUser } = useChatSettingState();
  const t = useT();
  const myXmppUsername = stateUser?.xmppUsername || '';
  const isPrivateRoom = chat?.type === 'private';
  const peer = isPrivateRoom
    ? (chat?.members || []).find(
        (m) => m.xmppUsername && m.xmppUsername !== myXmppUsername
      )
    : undefined;
  const peerOnline =
    !!peer?.xmppUsername && onlineUsers.includes(peer.xmppUsername);
  // Group/public rooms only - 1:1 rooms already show the peer's own
  // online/offline dot on their avatar, a member-count popover doesn't add
  // anything there.
  const showOnlineUsersPopover = !isPrivateRoom && onlineUsers.length > 0;

  // usersSet is the canonical name store - the same one Message.tsx
  // resolves sender names through. The preview must go through it too:
  // a message restored from the persist cache carries only `user.id` (the
  // wire identity isn't cached - see PERSISTED_MESSAGE_USER_FIELDS), so
  // reading `user.name` alone left this line showing a raw JID after every
  // refresh.
  const usersSet = useSelector((state: RootState) => state.rooms.usersSet);
  // Secure room avatars need the viewer's own `?ft=` token appended at
  // render time - see appendFileToken in helpers/secureFileUrl.
  const fileToken = useSelector(
    (state: RootState) => state.chatSettingStore.user?.fileToken || ''
  );

  const withAuthorFallback = useCallback(
    (message?: IMessage): IMessage | undefined => {
      if (!message) return message;
      const rawUserId = String(message?.user?.id || '');
      const localId = rawUserId.split('@')[0];
      const entry = usersSet?.[localId] ?? usersSet?.[rawUserId];
      const fromUsersSet = entry
        ? `${entry.firstName ?? ''} ${entry.lastName ?? ''}`.trim()
        : '';

      // usersSet first, exactly like Message.tsx: it's the live store, so
      // a renamed user updates here too instead of showing whatever name
      // was cached with the message. The message's own `name` is the
      // fallback that carries broadcast/system senders ("Ethora"), which
      // never appear in usersSet.
      const safeName =
        fromUsersSet ||
        String(message?.user?.name || '').trim() ||
        localId ||
        rawUserId ||
        'Unknown';

      return {
        ...message,
        // Call logs bake an English sentence into `body` when the stanza
        // arrives; rebuild from the meta so the preview follows the
        // current language like the transcript does.
        body: message.callLog
          ? formatCallLogLabel(message.callLog, t, message.body)
          : message.body,
        user: {
          ...message.user,
          name: safeName,
        },
      };
    },
    [usersSet, t]
  );

  const lastRawMessage = chat?.messages?.[(chat?.messages?.length ?? 0) - 1];
  const lastMessage = useMemo(
    () => withAuthorFallback(lastRawMessage),
    [chat?.jid, lastRawMessage?.id, lastRawMessage?.body, withAuthorFallback]
  );

  const formatTimeToHHMM = (
    isoTime?: string | Date | number
  ): string | undefined => {
    if (isoTime == null) return undefined;

    let date: Date;

    try {
      if (isoTime instanceof Date) {
        date = isoTime;
      } else if (typeof isoTime === 'number') {
        date = new Date(isoTime);
      } else if (typeof isoTime === 'string') {
        const trimmedTime = isoTime.trim();

        if (/^\d+$/.test(trimmedTime)) {
          date = new Date(parseInt(trimmedTime));
        } else {
          date = new Date(trimmedTime);
        }
      } else {
        return undefined;
      }

      if (isNaN(date.getTime())) {
        return undefined;
      }

      const now = new Date();

      if (date.getFullYear() !== now.getFullYear()) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}/${month}/${day}`;
      }

      if (date.toDateString() === now.toDateString()) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
      }

      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${month}/${day}`;
    } catch (error) {
      console.warn('Error parsing date:', error);
      return undefined;
    }
  };

  return (
    <ChatItem
      key={index}
      active={isChatActive}
      onClick={() => performClick(chat)}
      bg={config?.colors?.primary}
    >
      <ProfileImagePlaceholder
        name={displayName}
        icon={appendFileToken(chat?.icon, fileToken)}
        online={peerOnline}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          // Let this column shrink to the container instead of being sized by
          // its content. Without min-width:0 a long 1:1 title (e.g. an email
          // address) forces the whole row wider than the list -> that single
          // item overflows and the list gets a horizontal scroll.
          minWidth: 0,
          flex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            minWidth: 0,
            gap: '16px',
            height: '24px',
            justifyContent: 'space-between',
          }}
        >
          <ChatInfo>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                minWidth: 0,
              }}
            >
              <ChatName style={{ minWidth: 0 }}>{displayName}</ChatName>
              {showOnlineUsersPopover && (
                <OnlineUsersPopover
                  onlineUsernames={onlineUsers}
                  members={chat?.members}
                  myXmppUsername={myXmppUsername}
                  isChatActive={isChatActive}
                />
              )}
            </div>
          </ChatInfo>

          <UserCount
            style={{
              color: !isChatActive ? '#8C8C8C' : '#fff',
              fontSize: 'var(--ethora-font-size-xs, 12px)',
            }}
            active={isChatActive}
          >
            {formatTimeToHHMM(lastMessage?.date ?? chat?.createdAt)}
          </UserCount>
        </div>
        <div
          style={{
            textAlign: 'right',
            display: 'flex',
            width: '100%',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {chat.composing ? (
            <Composing
              usersTyping={chat.composingList}
              style={{ color: !isChatActive ? '#141414' : '#fff' }}
            />
          ) : lastMessage?.body || lastMessage?.isDeleted ? (
            <LastMessageItem lastMessage={lastMessage} />
          ) : (chat?.messages?.length ?? 0) === 0 &&
            // Show "Room created" once the history attempt has settled, not only
            // when the MAM <fin complete> arrived. Newly created / empty rooms
            // often time out the MAM query (no fin, presence/affiliation race
            // after refresh) so historyComplete never flips true — settling on
            // a terminal preload state (done/error) covers those too.
            (chat?.historyComplete ||
              chat?.historyPreloadState === 'done' ||
              chat?.historyPreloadState === 'error') ? (
            <LastRoomMessageText>{t('room.created')}</LastRoomMessageText>
          ) : undefined}
          {chat.unreadMessages > 0 &&
            // Hide only while a room with NO locally loaded messages is doing
            // its first-ever history fetch — the count could still be
            // mid-climb (0 -> 1 -> 2 ...) there. A background catch-up
            // refetch (e.g. on every app refresh, for a room that already has
            // a correct persisted unreadMessages count) must NOT hide an
            // already-stable badge just because historyPreloadState flips to
            // 'loading' for that refetch — that made every room's badge
            // blink off and back on for ~1-2s on every refresh.
            !(
              chat.historyPreloadState === 'loading' &&
              (chat?.messages?.length ?? 0) === 0
            ) && (
              <NewMessageMarker
                style={{
                  backgroundColor: isChatActive
                    ? '#fff'
                    : config?.colors?.primary || '#0052CD',
                  color: isChatActive ? '#141414' : '#fff',
                }}
              >
                {chat.unreadCapped
                  ? `${Math.max(chat.unreadMessages, 10)}+`
                  : chat.unreadMessages}
              </NewMessageMarker>
            )}
        </div>
      </div>
    </ChatItem>
  );
};

// The room list re-renders on every dispatch that touches ANY room (Immer
// gives `state.rooms.rooms` a new top-level reference whenever one nested
// room changes), so without memo every row's component function re-ran on
// every single per-room update anywhere in the account — not just the one
// row that actually changed. `chat` keeps its own reference stable across
// unrelated updates (Immer only replaces the specific room object that
// changed), and `performClick`/`config` are already stable from RoomList, so
// the default shallow prop comparison correctly skips unaffected rows.
export default React.memo(ChatRoomItem);
