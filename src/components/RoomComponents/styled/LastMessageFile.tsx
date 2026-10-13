import React, { FC, useState } from 'react';
import styled from 'styled-components';
import { LastMessage } from '../../../types/types';
import {
  LastRoomMessageContainer,
  LastRoomMessageMedia,
  LastRoomMessageName,
  LastRoomMessageText,
} from './StyledRoomComponents';
import { FileIcon } from '../../../assets/icons';
import { useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import {
  appendFileToken,
  isSecureFileUrl,
  requestFileTokenRecovery,
} from '../../../helpers/secureFileUrl';

interface LastMessageFileProps
  extends Pick<LastMessage, 'user' | 'originalName' | 'locationPreview'> {}

const LastMessageFile: FC<LastMessageFileProps> = ({
  user,
  originalName,
  locationPreview,
}) => {
  const fileToken = useSelector(
    (state: RootState) => state.chatSettingStore.user?.fileToken || ''
  );
  // See LastTextMessage.tsx: an empty name (e.g. an opaque xmpp id) omits
  // the name line (and its trailing ":") entirely rather than rendering a
  // bare colon.
  const name = user?.name;
  const [failedPreview, setFailedPreview] = useState<string | null>(null);
  return (
    <LastRoomMessageContainer>
      {name && <LastRoomMessageName>{name}</LastRoomMessageName>}
      <LastRoomMessageMedia>
        {locationPreview && failedPreview !== locationPreview ? (
          <img
            src={appendFileToken(locationPreview, fileToken)}
            alt={locationPreview}
            style={{
              borderRadius: 16,
              cursor: 'pointer',
              maxWidth: '20px',
              maxHeight: '20px',
            }}
            onError={() => {
              if (isSecureFileUrl(locationPreview)) {
                requestFileTokenRecovery();
              }
              // No remote placeholder: fall back to the inline file icon.
              setFailedPreview(locationPreview);
            }}
          />
        ) : (
          <FileIcon style={{ width: '20px', height: '20px' }} />
        )}
        <LastRoomMessageText>{originalName || 'file'}</LastRoomMessageText>
      </LastRoomMessageMedia>
    </LastRoomMessageContainer>
  );
};

export default LastMessageFile;
