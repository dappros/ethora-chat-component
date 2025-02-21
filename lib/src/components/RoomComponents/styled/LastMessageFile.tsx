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
  extends Pick<LastMessage, 'user' | 'originalName'> {}

const LastMessageFile: FC<LastMessageFileProps> = ({ user, originalName }) => {
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
        <FileIcon style={{ width: '20px', height: '20px' }} />
        <LastRoomMessageText>{originalName || 'file'}</LastRoomMessageText>
      </div>
    </LastRoomMessageContainer>
  );
};

export default LastMessageFile;
