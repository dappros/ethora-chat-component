// src/components/Toast.tsx
import React from 'react';
import styled, { keyframes, css } from 'styled-components';

export interface ToastType {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const fadeOut = keyframes`
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(10px);
  }
`;

const progress = (duration: number) => keyframes`
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
`;

const ToastContainer = styled.div<{ type: string; duration: number }>`
  ${({ duration }) => css`
    animation:
      ${fadeIn} 0.3s forwards,
      ${fadeOut} 0.3s forwards ${duration - 300}ms;
  `}
  background-color: ${({ type }) => {
    switch (type) {
      case 'success':
        return '#4caf50';
      case 'error':
        return '#f44336';
      case 'info':
        return '#2196F3';
      default:
        return '#333';
    }
  }};
  color: white;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  position: relative;
  width: 240px;
  font-size: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
`;

const ProgressBar = styled.div<{ duration: number }>`
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.6);
  animation: ${({ duration }) => progress(duration)} linear
    ${({ duration }) => duration}ms forwards;
`;

const Toast: React.FC<ToastType> = ({
  title,
  message,
  type,
  duration = 3000,
}) => {
  return (
    <ToastContainer type={type} duration={duration}>
      <strong>{title}</strong>
      <p style={{ margin: '4px 0 0' }}>{message}</p>
      <ProgressBar duration={duration} />
    </ToastContainer>
  );
};

export { Toast };
