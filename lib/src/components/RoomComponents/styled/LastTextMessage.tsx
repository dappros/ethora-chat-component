import React, { FC } from 'react';
import {
  LastRoomMessageContainer,
  LastRoomMessageName,
  LastRoomMessageText,
} from './StyledRoomComponents';
import { LastMessage } from '../../../types/types';

interface LastTextMessageProps extends Pick<LastMessage, 'user' | 'body'> {}

const LastTextMessage: FC<LastTextMessageProps> = ({ user, body }) => {
  // An empty name (nothing resolved one, or only an opaque xmpp id exists)
  // omits line 1 entirely: the message then centres in the block instead of
  // sitting under an empty row.
  const name = user?.name;
  return (
    <LastRoomMessageContainer data-testid="last-message-block">
      {name && (
        <LastRoomMessageName data-testid="last-message-name">
          {name}
        </LastRoomMessageName>
      )}
      <LastRoomMessageText data-testid="last-message-line">
        {body || 'Chat created'}
      </LastRoomMessageText>
    </LastRoomMessageContainer>
  );
};

export default LastTextMessage;
