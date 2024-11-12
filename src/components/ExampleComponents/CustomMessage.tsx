import React, { forwardRef } from 'react';

import styled from 'styled-components';
import { MessageProps } from '../../types/types';

export const MessageContainer = styled.div<{ isUser: boolean }>`
  display: flex;
  flex-direction: ${(props) => (!props.isUser ? 'row' : 'row-reverse')};
  align-items: center;
  margin: 10px 0;
  width: '100%';
`;

export const MessageBubble = styled.div<{ isUser: boolean }>`
  background-color: ${(props) => (!props.isUser ? '#f1f0f0' : '#0052CD')};
  color: ${(props) => (!props.isUser ? '#000' : '#fff')};
  border-radius: 12px;
  padding: 10px;
  max-width: 60%;
`;

export const MessageText = styled.p`
  margin: 0;
  word-wrap: break-word;
`;

export const UserName = styled.span<{ isUser: boolean; color?: string }>`
  font-weight: bold;
  color: ${(props) =>
    props.color ? props.color : props.isUser ? '#0052CD' : '#333'};
  margin-right: 8px;
`;

export const MessageTimestamp = styled.span`
  font-size: 0.8em;
  color: #999;
  margin-left: 8px;
`;

export const MessagePhoto = styled.img`
  max-width: 100%;
  border-radius: 8px;
  margin-top: 8px;
`;

export const MessagePhotoContainer = styled.div`
  max-width: 100px;
  margin: 0;
`;

export const SystemMessage = styled.div`
  background-color: #e0e0e0;
  color: #555;
  text-align: center;
  padding: 8px;
  border-radius: 8px;
  margin: 10px 0;
  max-width: 60%;
`;

export const SystemMessageText = styled.p`
  margin: 0;
  font-size: 0.9em;
  color: #333;
`;

const CustomMessageExample = forwardRef<HTMLDivElement, MessageProps>(
  ({ message, isUser }, ref) => {
    return (
      <MessageContainer isUser={isUser} ref={ref}>
        <MessageBubble isUser={isUser}>
          <UserName isUser={isUser}>{message.user.name}</UserName>
          <MessageText>{message.body}</MessageText>
          <MessageTimestamp>{message.timestamp}</MessageTimestamp>
        </MessageBubble>
      </MessageContainer>
    );
  }
);

export default CustomMessageExample;
