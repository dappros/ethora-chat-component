import React, { FC } from 'react';
import {
  LastRoomMessageContainer,
  LastRoomMessageName,
  LastRoomMessageText,
} from './StyledRoomComponents';
import { LastMessage } from '../../../types/types';

interface LastMessageEmojiProps extends Pick<LastMessage, 'user' | 'body'> {}

const LastTextMessage: FC<LastMessageEmojiProps> = ({ user, body }) => {
  return (
    <LastRoomMessageContainer>
      <LastRoomMessageName>{user.name}</LastRoomMessageName>
      <LastRoomMessageText>{body || 'Chat created'}</LastRoomMessageText>
    </LastRoomMessageContainer>
  );
};

export default LastTextMessage;
