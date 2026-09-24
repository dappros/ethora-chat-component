import React, { FC } from 'react';
import { LastMessage } from '../../../types/types';
import {
  LastRoomMessageContainer,
  LastRoomMessageName,
  LastRoomMessageText,
} from './StyledRoomComponents';
import { LockIcon } from '../../../assets/icons';
import { useT } from '../../../i18n/useT';

interface LastMessageSealedProps extends Pick<LastMessage, 'user'> {}

/**
 * Room-list preview for a sealed attachment.
 *
 * It cannot say what the file is: the name and type are inside the seal and
 * only come out on download, and the server-held ones are placeholders - an
 * opaque `originalName` and `application/octet-stream`. So it says exactly
 * what is known, which is that an encrypted file arrived.
 */
const LastMessageSealed: FC<LastMessageSealedProps> = ({ user }) => {
  const t = useT();
  // See LastTextMessage.tsx: an empty name (e.g. an opaque xmpp id) omits the
  // name line, and its trailing ":", rather than rendering a bare colon.
  const name = user?.name;

  return (
    <LastRoomMessageContainer>
      {name && <LastRoomMessageName>{name}:</LastRoomMessageName>}
      <div style={{ display: 'flex', flexDirection: 'row', gap: '4px' }}>
        <LockIcon width={16} height={16} />
        <LastRoomMessageText>{t('media.sealedFile')}</LastRoomMessageText>
      </div>
    </LastRoomMessageContainer>
  );
};

export default LastMessageSealed;
