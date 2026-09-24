import React, { FC } from 'react';
import { LastMessage } from '../../types/types';
import LastMessageVideo from './styled/LastMessageVideo';
import LastTextMessage from './styled/LastTextMessage';
import LastMessagePhoto from './styled/LastMessagePhoto';
import LastMessageEmoji from './styled/LastMessageEmoji';
import LastMessageFile from './styled/LastMessageFile';
import LastAudioMessage from './styled/LastAudioMessage';
import LastMessageSealed from './styled/LastMessageSealed';
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

  // A sealed attachment must be checked before mimetype: the server holds
  // `application/octet-stream` for it, which the audio branch below claims
  // (voice notes upload under the same type), so it rendered as "audio" with
  // a play button. The flag rides on <data> in the clear, so this is right
  // even for a message whose body would not decrypt.
  if (lastMessage?.clientEncrypted === 'true') {
    return <LastMessageSealed {...lastMessage} />;
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
