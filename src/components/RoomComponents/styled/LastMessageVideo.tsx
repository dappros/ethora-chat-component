import React, { FC } from 'react';
import styled from 'styled-components';
import { LastMessage } from '../../../types/types';
import {
  LastRoomMessageContainer,
  LastRoomMessageName,
  LastRoomMessageText,
  ShadeWrapper,
} from './StyledRoomComponents';

const VideoContainer = styled.div`
  position: relative;
  width: 20px;
  height: 20px;
  overflow: hidden;
  border-radius: 8px;
`;

const Thumbnail = styled.video`
  width: 20px;
  height: 20px;
  object-fit: cover;
  pointer-events: none;
`;

const PlayButton = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-40%, -50%);
  width: 8px;
  height: 9px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  color: white;
  font-size: 10px;
  pointer-events: none;
  z-index: 100;
`;

interface LastMessageVideoProps
  extends Pick<LastMessage, 'user' | 'location' | 'originalName'> {}

const LastMessageVideo: FC<LastMessageVideoProps> = ({
  user,
  location,
  originalName,
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
        <VideoContainer>
          <ShadeWrapper>
            <Thumbnail src={location} muted playsInline />
          </ShadeWrapper>
          <PlayButton>▶</PlayButton>
        </VideoContainer>
        <LastRoomMessageText>{originalName || 'file'}</LastRoomMessageText>
      </div>
    </LastRoomMessageContainer>
  );
};

export default LastMessageVideo;
