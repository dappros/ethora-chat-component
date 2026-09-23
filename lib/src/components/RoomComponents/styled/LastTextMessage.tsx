import React, { FC } from 'react';
import {
  LastRoomMessageContainer,
  LastRoomMessageName,
  LastRoomMessageText,
} from './StyledRoomComponents';
import { LastMessage } from '../../../types/types';

interface LastMessageEmojiProps extends Pick<LastMessage, 'user' | 'body'> {}

const LastTextMessage: FC<LastMessageEmojiProps> = ({ user, body }) => {
  // An empty name (e.g. an opaque xmpp id nobody should ever see - see
  // isOpaqueXmppUserId / withAuthorFallback) omits the name line entirely
  // rather than rendering an empty row: the body alone reads fine, a blank
  // line above it does not.
  const name = user?.name;
  return (
    <LastRoomMessageContainer>
      {name && <LastRoomMessageName>{name}</LastRoomMessageName>}
      <LastRoomMessageText>{body || 'Chat created'}</LastRoomMessageText>
    </LastRoomMessageContainer>
  );
};

export default LastTextMessage;
