import React, { useMemo } from 'react';
import { IConfig, IRoom } from '../../types/types';
import { ProfileImagePlaceholder } from '../MainComponents/ProfileImagePlaceholder';
import {
  ChatItem,
  ChatInfo,
  ChatName,
  LastMessage,
  UserCount,
} from '../styled/RoomListComponents';
import Composing from '../styled/StyledInputComponents/Composing';

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
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
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
          {lastMessage && (
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
          ) : (
            config?.betaChatsLoading &&
            lastMessage?.body && (
              <div
                style={{
                  display: 'flex',
                  width: '80%',
                  flexDirection: 'column',
                  alignItems: 'start',
                }}
              >
                <div
                  style={{
                    height: '20px',
                    fontWeight: '600',
                  }}
                >
                  {lastMessage.user.name || ''}:
                </div>
                <div
                  style={{
                    height: '20px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '200px',
                  }}
                >
                  {lastMessage.body || 'Chat created'}
                </div>
              </div>
            )
          )}
          {chat.unreadMessages > 0 && (
            <div
              style={{
                borderRadius: '8px',
                backgroundColor: isChatActive
                  ? '#fff'
                  : config?.colors?.primary,
                color: isChatActive ? '#141414' : '#fff',
                padding: '2px 2px',
                fontWeight: 600,
                minWidth: '24px',
                minHeight: '24px',
                fontSize: '14px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginLeft: 'auto',
              }}
            >
              {chat.unreadMessages}
            </div>
          )}
        </div>
      </div>
    </ChatItem>
  );
};

export default ChatRoomItem;
