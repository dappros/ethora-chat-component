import React, { FC } from 'react';
import styled from 'styled-components';
import { dotFade, reducedMotion } from '../../../styles/motion';

// Define props
interface ComposingProps {
  usersTyping?: string[];
  style?: any;
}

// Styled components
const Wrapper = styled.div`
  display: flex;
  align-items: center;
  font-size: 14px;
  color: var(--ethora-color-text-secondary, #555);
  z-index: 1000;
  position: static;
  bottom: 4px;
  left: 16px;
`;

const UserTypingText = styled.span`
  margin-right: 5px;
`;

const Dot = styled.span`
  font-size: 24px;
  line-height: 0;
  animation: ${dotFade} 1.5s infinite;
  ${reducedMotion}

  &:nth-child(2) {
    animation-delay: 0.2s;
  }

  &:nth-child(3) {
    animation-delay: 0.4s;
  }
`;

// Composing component
const Composing: FC<ComposingProps> = ({ usersTyping = ['User'], style }) => {
  let typingText: string;

  if (usersTyping.length === 1) {
    typingText = `${usersTyping[0]} is typing`;
  } else if (usersTyping.length === 2) {
    typingText = `${usersTyping[0]} and ${usersTyping[1]} are typing`;
  } else if (usersTyping.length > 2) {
    typingText = `${usersTyping.length} people are typing`;
  } else {
    typingText = '';
  }

  return (
    <Wrapper style={{ ...style }}>
      <UserTypingText>{typingText}</UserTypingText>
      <Dot>.</Dot>
      <Dot>.</Dot>
      <Dot>.</Dot>
    </Wrapper>
  );
};

export default Composing;
