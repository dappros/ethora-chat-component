import React, { FC } from 'react';
import styled from 'styled-components';
import { LastMessage } from '../../../types/types';
import {
  LastMessageImg,
  LastRoomMessageContainer,
  LastRoomMessageName,
  LastRoomMessageText,
  ShadeWrapper,
} from './StyledRoomComponents';
import { useSelector } from 'react-redux';
import { RootState } from '../../../roomStore';
import { appendFileToken } from '../../../helpers/secureFileUrl';

const PhotoContainer = styled.div`
  position: relative;
  width: 20px;
  height: 20px;
  overflow: hidden;
  border-radius: 8px;
  width: 20px;
  height: 20px;
  object-fit: cover;
  pointer-events: none;
`;

interface LastMessagePhotoProps
  extends Pick<LastMessage, 'user' | 'originalName' | 'locationPreview'> {}

const LastMessagePhoto: FC<LastMessagePhotoProps> = ({
  user,
  locationPreview,
  originalName,
}) => {
  const fileToken = useSelector(
    (state: RootState) => state.chatSettingStore.user?.fileToken || ''
  );
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
        <PhotoContainer>
          <ShadeWrapper>
            <LastMessageImg src={appendFileToken(locationPreview, fileToken)} />
          </ShadeWrapper>
        </PhotoContainer>
        <LastRoomMessageText>{originalName || 'file'}</LastRoomMessageText>
      </div>
    </LastRoomMessageContainer>
  );
};

export default LastMessagePhoto;
