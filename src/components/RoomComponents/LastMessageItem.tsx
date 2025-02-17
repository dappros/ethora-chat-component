import React, { FC } from 'react';
import { LastMessage } from '../../types/types';
import LastMessageVideo from './styled/LastMessageVideo';
import LastTextMessage from './styled/LastTextMessage';
import LastMessagePhoto from './styled/LastMessagePhoto';
import LastMessageEmoji from './styled/LastMessageEmoji';
import LastMessageFile from './styled/LastMessageFile';

interface LastMessageItemProps {
  lastMessage: LastMessage;
}

const LastMessageItem: FC<LastMessageItemProps> = ({ lastMessage }) => {
  const { body, emoji, mimetype } = lastMessage;

  if (mimetype) {
    if (mimetype.startsWith('image/')) {
      return <LastMessagePhoto {...lastMessage} />;
    }

    if (mimetype.startsWith('video/')) {
      return <LastMessageVideo {...lastMessage} />;
    }

    return <LastMessageFile {...lastMessage} />;
  }

  if (emoji) {
    return <LastMessageEmoji {...lastMessage} />;
  }

  if (body) {
    return <LastTextMessage {...lastMessage} />;
  }

  return undefined;
};

export default LastMessageItem;
