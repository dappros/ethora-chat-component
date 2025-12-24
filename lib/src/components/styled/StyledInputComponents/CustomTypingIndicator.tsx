import React, { FC } from 'react';
import styled, { keyframes } from 'styled-components';

interface CustomTypingIndicatorProps {
  usersTyping: string[];
  text?: string | ((usersTyping: string[]) => string);
  position?: 'bottom' | 'top' | 'overlay' | 'floating';
  styles?: React.CSSProperties;
  customComponent?: React.ComponentType<{
    usersTyping: string[];
    text: string;
    isVisible: boolean;
  }>;
  isVisible: boolean;
}

const dotAnimation = keyframes`
  0% { opacity: 0.2; }
  20% { opacity: 1; }
  100% { opacity: 0.2; }
`;

const pulseAnimation = keyframes`
  0% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 0.8; }
`;

const BaseWrapper = styled.div<{ position: string }>`
  display: flex;
  align-items: center;
  font-size: 14px;
  color: #555;
  z-index: 1000;
  transition: all 0.3s ease-in-out;

  ${({ position }) => {
    switch (position) {
      case 'top':
        return `
          position: absolute;
          top: 8px;
          left: 16px;
          right: 16px;
          background: rgba(255, 255, 255, 0.95);
          padding: 8px 12px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          backdrop-filter: blur(10px);
        `;
      case 'overlay':
        return `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 16px 24px;
          border-radius: 12px;
          animation: ${pulseAnimation} 2s infinite;
          backdrop-filter: blur(10px);
        `;
      case 'floating':
        return `
          position: fixed;
          bottom: 80px;
          right: 20px;
          background: rgba(255, 255, 255, 0.95);
          padding: 12px 16px;
          border-radius: 20px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
          backdrop-filter: blur(10px);
          animation: ${pulseAnimation} 2s infinite;
        `;
      case 'bottom':
      default:
        return `
          position: static;
          bottom: 4px;
          left: 16px;
          padding: 8px 0;
        `;
    }
  }}
`;

const UserTypingText = styled.span`
  margin-right: 8px;
  font-weight: 500;
`;

const Dot = styled.span`
  font-size: 20px;
  line-height: 0;
  animation: ${dotAnimation} 1.5s infinite;
  margin-right: 2px;

  &:nth-child(2) {
    animation-delay: 0.2s;
  }

  &:nth-child(3) {
    animation-delay: 0.4s;
  }
`;

const ProcessingText = styled.span`
  font-style: italic;
  opacity: 0.8;
`;

const generateDefaultText = (usersTyping: string[]): string => {
  if (usersTyping.length === 0) return '';

  if (usersTyping.length === 1) {
    return `${usersTyping[0]} is typing`;
  } else if (usersTyping.length === 2) {
    return `${usersTyping[0]} and ${usersTyping[1]} are typing`;
  } else if (usersTyping.length > 2) {
    return `${usersTyping.length} people are typing`;
  }

  return '';
};

const generateProcessingText = (usersTyping: string[]): string => {
  if (usersTyping.length === 0) return '';

  const processingStates = ['processing', 'thinking', 'generating answer'];
  const randomState =
    processingStates[Math.floor(Math.random() * processingStates.length)];

  if (usersTyping.length === 1) {
    return `${usersTyping[0]} is ${randomState}`;
  } else if (usersTyping.length === 2) {
    return `${usersTyping[0]} and ${usersTyping[1]} are ${randomState}`;
  } else if (usersTyping.length > 2) {
    return `${usersTyping.length} people are ${randomState}`;
  }

  return '';
};

const CustomTypingIndicator: FC<CustomTypingIndicatorProps> = ({
  usersTyping = [],
  text,
  position = 'bottom',
  styles = {},
  customComponent: CustomComponent,
  isVisible = true,
}) => {
  if (!isVisible || usersTyping.length === 0) {
    return null;
  }

  let displayText: string;

  if (typeof text === 'function') {
    displayText = text(usersTyping);
  } else if (typeof text === 'string') {
    displayText = text;
  } else {
    displayText = generateDefaultText(usersTyping);
  }

  if (CustomComponent) {
    return (
      <CustomComponent
        usersTyping={usersTyping}
        text={displayText}
        isVisible={isVisible}
      />
    );
  }

  return (
    <BaseWrapper position={position} style={styles}>
      <UserTypingText>{displayText}</UserTypingText>
      <Dot>.</Dot>
      <Dot>.</Dot>
      <Dot>.</Dot>
    </BaseWrapper>
  );
};

export default CustomTypingIndicator;

export { generateDefaultText, generateProcessingText };
