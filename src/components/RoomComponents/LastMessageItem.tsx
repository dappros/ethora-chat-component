import React, { FC } from 'react';
import { LastMessage } from '../../types/types';
import LastMessageVideo from './styled/LastMessageVideo';
import LastTextMessage from './styled/LastTextMessage';
import LastMessagePhoto from './styled/LastMessagePhoto';
import LastMessageEmoji from './styled/LastMessageEmoji';
import LastMessageFile from './styled/LastMessageFile';
import LastAudioMessage from './styled/LastAudioMessage';
import { LastRoomMessageText } from './styled/StyledRoomComponents';
import { useT } from '../../i18n/useT';

interface LastMessageItemProps {
  lastMessage: LastMessage;
}

const LastMessageItem: FC<LastMessageItemProps> = ({ lastMessage }) => {
  const t = useT();
  const { body, emoji, mimetype } = lastMessage;

  if (lastMessage?.isDeleted) {
    return (
      <LastRoomMessageText style={{ fontStyle: 'italic', opacity: 0.7 }}>
        {t('message.deleted')}
      </LastRoomMessageText>
    );
  }

  if (mimetype) {
    if (mimetype.startsWith('image/')) {
      return <LastMessagePhoto {...lastMessage} />;
    }

    if (mimetype.startsWith('video/')) {
      return <LastMessageVideo {...lastMessage} />;
    }

    if (
      mimetype.startsWith('audio/') ||
      mimetype.includes('application/octet-stream')
    ) {
      return <LastAudioMessage {...lastMessage} />;
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
