import React, { FC } from 'react';
import { LastMessage } from '../../types/types';
import LastTextMessage from './styled/LastTextMessage';
import LastMessageEmoji from './styled/LastMessageEmoji';
import LastMessageMedia from './styled/LastMessageMedia';
import { deriveMediaPreview } from '../../helpers/lastMessagePreview';
import LastMessageSealed from './styled/LastMessageSealed';
import {
  LastRoomMessageContainer,
  LastRoomMessageName,
  LastRoomMessageText,
} from './styled/StyledRoomComponents';
import { useT } from '../../i18n/useT';

interface LastMessageItemProps {
  lastMessage: LastMessage;
  /** The room is end-to-end encrypted: media shows an icon and label only. */
  sealed?: boolean;
}

const LastMessageItem: FC<LastMessageItemProps> = ({ lastMessage, sealed }) => {
  const t = useT();
  const { body, emoji } = lastMessage;

  if (lastMessage?.isDeleted) {
    return (
      <LastRoomMessageContainer data-testid="last-message-block">
        {lastMessage.user?.name && (
          <LastRoomMessageName data-testid="last-message-name">
            {lastMessage.user.name}
          </LastRoomMessageName>
        )}
        <LastRoomMessageText
          data-testid="last-message-line"
          style={{ fontStyle: 'italic', opacity: 0.7 }}
        >
          {t('message.deleted')}
        </LastRoomMessageText>
      </LastRoomMessageContainer>
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

  const media = deriveMediaPreview(lastMessage, {
    sealed,
    senderNames: [
      String(lastMessage.user?.name ?? ''),
      String(lastMessage.user?.id ?? '').split('@')[0],
    ],
  });
  if (media) {
    return <LastMessageMedia preview={media} name={lastMessage.user?.name} />;
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
