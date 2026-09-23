import React, { FC } from 'react';
import {
  LastRoomMessageContainer,
  LastRoomMessageName,
  LastRoomMessageText,
  ShadeWrapper,
} from './StyledRoomComponents';
import { LastMessage } from '../../../types/types';
import styled from 'styled-components';

interface LastMessageEmojiProps extends Pick<LastMessage, 'user' | 'body'> {}

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

const LastAudioMessage: FC<LastMessageEmojiProps> = ({ user, body }) => {
  // See LastTextMessage.tsx: an empty name (e.g. an opaque xmpp id) omits
  // the name line entirely rather than rendering a bare row.
  const name = user?.name;
  return (
    <LastRoomMessageContainer>
      {name && <LastRoomMessageName>{name}</LastRoomMessageName>}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '4px',
        }}
      >
        <PhotoContainer>
          <ShadeWrapper>
            <PlayButton>▶</PlayButton>
          </ShadeWrapper>
        </PhotoContainer>
        <LastRoomMessageText>audio</LastRoomMessageText>
      </div>
    </LastRoomMessageContainer>
  );
};

export default LastAudioMessage;
