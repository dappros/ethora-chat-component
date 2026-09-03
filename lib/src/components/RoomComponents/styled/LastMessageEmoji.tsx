import React, { FC } from 'react';
import {
  LastRoomMessageContainer,
  LastRoomMessageName,
  LastRoomMessageText,
} from './StyledRoomComponents';
import { LastMessage } from '../../../types/types';
import {
  getEmojiNativeById,
  useEmojiData,
} from '../../../helpers/lazyEmoji';

interface LastMessageEmojiProps extends Pick<LastMessage, 'user' | 'emoji'> {}

const LastMessageEmoji: FC<LastMessageEmojiProps> = ({ user, emoji }) => {
  useEmojiData();
  const memoEmoji = getEmojiNativeById;

  return (
    <LastRoomMessageContainer>
      <LastRoomMessageName>{user.name || ''}:</LastRoomMessageName>
      <LastRoomMessageText>{memoEmoji(emoji)}</LastRoomMessageText>
    </LastRoomMessageContainer>
  );
};

export default LastMessageEmoji;
