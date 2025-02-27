import React, { FC } from 'react';
import styled from 'styled-components';
import { LastMessage } from '../../../types/types';
import {
  LastRoomMessageContainer,
  LastRoomMessageName,
  LastRoomMessageText,
} from './StyledRoomComponents';
import { FileIcon } from '../../../assets/icons';

interface LastMessageFileProps
  extends Pick<LastMessage, 'user' | 'originalName' | 'locationPreview'> {}

const LastMessageFile: FC<LastMessageFileProps> = ({
  user,
  originalName,
  locationPreview,
}) => {
  return (
    <LastRoomMessageContainer>
      <LastRoomMessageName>{user.name || ''}:</LastRoomMessageName>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '4px',
        }}
      >
        {locationPreview ? (
          <img
            src={locationPreview}
            alt={locationPreview}
            style={{
              borderRadius: 16,
              cursor: 'pointer',
              maxWidth: '20px',
              maxHeight: '20px',
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg';
            }}
          />
        ) : (
          <FileIcon style={{ width: '20px', height: '20px' }} />
        )}
        <LastRoomMessageText>{originalName || 'file'}</LastRoomMessageText>
      </div>
    </LastRoomMessageContainer>
  );
};

export default LastMessageFile;
