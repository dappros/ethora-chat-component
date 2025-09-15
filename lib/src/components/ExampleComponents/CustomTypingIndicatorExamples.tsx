import React from 'react';
import styled, { keyframes } from 'styled-components';

// 1. AI Processing Indicator
const pulseAnimation = keyframes`
  0% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.05); }
  100% { opacity: 0.6; transform: scale(1); }
`;

const AITypingWrapper = styled.div`
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px 20px;
  border-radius: 25px;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
  animation: ${pulseAnimation} 2s infinite;
  font-weight: 500;
  font-size: 14px;
`;

const AIAvatar = styled.div`
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
`;

export const AIProcessingIndicator: React.FC<{
  usersTyping: string[];
  text: string;
  isVisible: boolean;
}> = ({ usersTyping, text, isVisible }) => {
  if (!isVisible) return null;

  return (
    <AITypingWrapper>
      <AIAvatar>AI</AIAvatar>
      <span>{text}</span>
    </AITypingWrapper>
  );
};

// 2. Minimal Dot Indicator
const dotAnimation = keyframes`
  0%, 20% { opacity: 0.2; }
  50% { opacity: 1; }
  80%, 100% { opacity: 0.2; }
`;

const MinimalWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
`;

const MinimalDot = styled.span`
  width: 6px;
  height: 6px;
  background: #666;
  border-radius: 50%;
  margin: 0 2px;
  animation: ${dotAnimation} 1.4s infinite;

  &:nth-child(2) {
    animation-delay: 0.2s;
  }

  &:nth-child(3) {
    animation-delay: 0.4s;
  }
`;

export const MinimalTypingIndicator: React.FC<{
  usersTyping: string[];
  text: string;
  isVisible: boolean;
}> = ({ usersTyping, text, isVisible }) => {
  if (!isVisible) return null;

  return (
    <MinimalWrapper>
      <MinimalDot />
      <MinimalDot />
      <MinimalDot />
    </MinimalWrapper>
  );
};

// 3. Chat Bubble Style Indicator
const ChatBubbleWrapper = styled.div`
  background: #f0f0f0;
  border-radius: 18px;
  padding: 8px 16px;
  margin: 4px 0;
  display: inline-block;
  max-width: 200px;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 20px;
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid #f0f0f0;
  }
`;

export const ChatBubbleTypingIndicator: React.FC<{
  usersTyping: string[];
  text: string;
  isVisible: boolean;
}> = ({ usersTyping, text, isVisible }) => {
  if (!isVisible) return null;

  return (
    <ChatBubbleWrapper>
      <span style={{ fontSize: '14px', color: '#666' }}>{text}</span>
    </ChatBubbleWrapper>
  );
};

// 4. Progress Bar Style Indicator
const ProgressWrapper = styled.div`
  background: rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ProgressBar = styled.div`
  width: 60px;
  height: 4px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  overflow: hidden;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, #007bff, transparent);
    animation: progressAnimation 1.5s infinite;
  }
`;

const progressAnimation = keyframes`
  0% { left: -100%; }
  100% { left: 100%; }
`;

export const ProgressTypingIndicator: React.FC<{
  usersTyping: string[];
  text: string;
  isVisible: boolean;
}> = ({ usersTyping, text, isVisible }) => {
  if (!isVisible) return null;

  return (
    <ProgressWrapper>
      <span style={{ fontSize: '12px', color: '#666' }}>{text}</span>
      <ProgressBar />
    </ProgressWrapper>
  );
};

// Export all example components
export const CustomTypingIndicatorExamples = {
  AIProcessingIndicator,
  MinimalTypingIndicator,
  ChatBubbleTypingIndicator,
  ProgressTypingIndicator,
};
