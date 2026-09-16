import React from 'react';
import { IConfig, IMessage } from '../../types/types';
import { MessagesScroll } from '../styled/StyledComponents';
import Loader from '../styled/Loader';
import { MessageContainer } from './MessageContainer';

interface ChatRoomOpeningPreviewProps {
  seedMessage: IMessage;
  config?: IConfig;
  xmppUsername: string;
  isReply: boolean;
  CustomMessage?: React.ComponentType<{
    message: IMessage;
    isUser: boolean;
    $isUser?: boolean;
    isReply: boolean;
  }>;
}

// Shown while a room is opening, has no loaded history yet, but the API
// already told us its last message (`chat.lastMessage`, seeded from
// GET /v1/chats/my - see createRoomFromApi). Renders that one message in
// its normal bubble, anchored to the bottom the way a real transcript
// would sit, with a loader above it standing in for the rest of the
// conversation that is still on its way from MAM. Deliberately not a
// skeleton list of fake bubbles: we only actually know about this one
// message, and showing it in the same bubble MessageContainer renders for
// a live message (rather than inventing a separate "preview" look) is what
// keeps it honest about being a real, known message rather than a mockup.
export const ChatRoomOpeningPreview: React.FC<ChatRoomOpeningPreviewProps> = ({
  seedMessage,
  config,
  xmppUsername,
  isReply,
  CustomMessage,
}) => {
  return (
    <MessagesScroll
      data-testid="chat-room-opening-seed"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: 'var(--ethora-space-4, 16px) 0',
        }}
      >
        <Loader
          data-testid="chat-room-opening-loader"
          color={config?.colors?.primary}
          size={28}
        />
      </div>
      <div
        style={{
          flex: '1 1 auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          minHeight: 0,
        }}
      >
        <MessageContainer
          CustomMessage={CustomMessage}
          message={seedMessage}
          activeMessage={undefined}
          config={config}
          xmppUsername={xmppUsername}
          isReply={isReply}
          showDateLabel
        />
      </div>
    </MessagesScroll>
  );
};

export default ChatRoomOpeningPreview;
