import React, { FC } from 'react';
import {
  LastRoomMessageContainer,
  LastRoomMessageName,
  LastRoomMessageText,
} from './StyledRoomComponents';
import { LastMessage } from '../../../types/types';
import emojiData from '@emoji-mart/data';

interface LastMessageEmojiProps extends Pick<LastMessage, 'user' | 'emoji'> {}

const LastMessageEmoji: FC<LastMessageEmojiProps> = ({ user, emoji }) => {
  const memoEmoji = (id: string) => {
    const emoji = (emojiData as any).emojis[id];
    return emoji ? emoji.skins[0].native : '';
  };

  return (
    <LastRoomMessageContainer>
      <LastRoomMessageName>{user.name || ''}:</LastRoomMessageName>
      <LastRoomMessageText>{memoEmoji(emoji)}</LastRoomMessageText>
    </LastRoomMessageContainer>
  );
};

export default LastMessageEmoji;
