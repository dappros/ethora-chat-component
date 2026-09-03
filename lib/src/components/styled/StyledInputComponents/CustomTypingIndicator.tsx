import React, { FC } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { reducedMotion } from '../../../styles/motion';

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

const BaseWrapper = styled.div<{ $position: string }>`
  display: flex;
  align-items: center;
  font-size: 14px;
  color: var(--ethora-color-text-secondary, #555);
  z-index: 1000;
  transition: all 0.3s ease-in-out;

  ${({ $position }) => {
    switch ($position) {
      case 'top':
        return css`
          position: absolute;
          top: 8px;
          left: 16px;
          right: 16px;
          background: var(--ethora-color-bg, #fff);
          padding: 8px 12px;
          border-radius: var(--ethora-radius-sm, 8px);
          box-shadow: var(--ethora-shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.1));
          border: 1px solid var(--ethora-color-border, #e6e8ec);
        `;
      case 'overlay':
        return css`
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0, 0, 0, 0.8);
          color: var(--ethora-color-text-on-primary, #fff);
          padding: 16px 24px;
          border-radius: var(--ethora-radius-md, 12px);
          animation: ${pulseAnimation} 2s infinite;
          ${reducedMotion}
        `;
      case 'floating':
        return css`
          position: fixed;
          bottom: 80px;
          right: 20px;
          background: var(--ethora-color-bg, #fff);
          padding: 12px 16px;
          border-radius: var(--ethora-radius-full, 20px);
          box-shadow: var(--ethora-shadow-md, 0 4px 16px rgba(0, 0, 0, 0.15));
          border: 1px solid var(--ethora-color-border, #e6e8ec);
          animation: ${pulseAnimation} 2s infinite;
          ${reducedMotion}
        `;
      case 'bottom':
      default:
        return css`
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
  ${reducedMotion}

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
    <BaseWrapper $position={position} style={styles}>
      <UserTypingText>{displayText}</UserTypingText>
      <Dot>.</Dot>
      <Dot>.</Dot>
      <Dot>.</Dot>
    </BaseWrapper>
  );
};

export default CustomTypingIndicator;

export { generateDefaultText, generateProcessingText };
