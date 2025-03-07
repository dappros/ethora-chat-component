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
  const lastMessage = useMemo(
    () => chat?.messages?.[chat?.messages.length - 1],
    [chat?.messages?.length]
  );

  const formatTimeToHHMM = (isoTime: string | Date): string => {
    const date = new Date(isoTime);
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
    } else {
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${month}/${day}`;
    }
  };

  return (
    <ChatItem
      key={index}
      active={isChatActive}
      onClick={() => performClick(chat)}
      bg={config?.colors?.primary}
    >
      <ProfileImagePlaceholder name={chat.name} icon={chat?.icon} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            gap: '16px',
            height: '24px',
            justifyContent: 'space-between',
          }}
        >
          <ChatInfo>
            <ChatName>{chat.name}</ChatName>
          </ChatInfo>
          {lastMessage && lastMessage.date && (
            <UserCount
              style={{
                color: !isChatActive ? '#8C8C8C' : '#fff',
                fontSize: '12px',
              }}
              active={isChatActive}
            >
              {formatTimeToHHMM(lastMessage.date)}
            </UserCount>
          )}
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
          ) : lastMessage?.body ? (
            <LastMessageItem lastMessage={lastMessage} />
          ) : chat.messages.length === 0 && chat.historyComplete ? (
            <LastRoomMessageText>Room created</LastRoomMessageText>
          ) : undefined}
          {chat.unreadMessages > 0 && (
            <NewMessageMarker
              style={{
                backgroundColor: isChatActive
                  ? '#fff'
                  : config?.colors?.primary,
                color: isChatActive ? '#141414' : '#fff',
              }}
            >
              {chat.unreadMessages}
            </NewMessageMarker>
          )}
        </div>
      </div>
    </ChatItem>
  );
};

export default ChatRoomItem;
