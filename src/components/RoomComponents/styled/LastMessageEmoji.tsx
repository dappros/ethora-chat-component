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

  // See LastTextMessage.tsx: an empty name (e.g. an opaque xmpp id) omits
  // the name line (and its trailing ":") entirely rather than rendering a
  // bare colon.
  const name = user?.name;
  return (
    <LastRoomMessageContainer>
      {name && <LastRoomMessageName>{name}:</LastRoomMessageName>}
      <LastRoomMessageText>{memoEmoji(emoji)}</LastRoomMessageText>
    </LastRoomMessageContainer>
  );
};

export default LastMessageEmoji;
