import React from 'react';
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
            alignItems: 'start',
            width: '100%',
            gap: '16px',
            height: '24px',
            justifyContent: 'space-between',
          }}
        >
          <ChatInfo>
            <ChatName>{chat.name}</ChatName>
            <LastMessage style={{ color: '#141414', fontWeight: 600 }}>
              {chat?.lastRoomMessage?.name && `${chat?.lastRoomMessage?.name}:`}
            </LastMessage>
            <LastMessage>{chat?.lastRoomMessage?.body}</LastMessage>
          </ChatInfo>
          <UserCount active={isChatActive}>{chat.usersCnt}</UserCount>
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
          {!isChatActive
            ? chat.composing && (
                <Composing
                  usersTyping={chat.composingList}
                  style={{ color: !isChatActive ? '#141414' : '#fff' }}
                />
              )
            : chat.lastRoomMessage && (
                <div
                  style={{
                    display: 'flex',
                    width: '100%',
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
                    {chat.lastRoomMessage?.name || 'asdads'}:
                  </div>
                  <div
                    style={{
                      height: '20px',
                    }}
                  >
                    {chat.lastRoomMessage?.body || 'Chat created'}
                  </div>
                </div>
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
