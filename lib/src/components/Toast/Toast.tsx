// src/components/Toast.tsx
import React from 'react';
import styled, { keyframes, css } from 'styled-components';
import { MOTION_EASE, reducedMotion } from '../../styles/motion';

export interface ToastType {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

// Toasts live bottom-left (see ToastContext), so they enter/exit along the
// same axis a Telegram-style corner toast would - rising in, sinking out -
// rather than the top-anchored slide the old keyframes implied.
const slideUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const slideDown = keyframes`
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(12px);
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

const TYPE_ACCENT: Record<ToastType['type'], string> = {
  success: 'var(--ethora-color-success, #12B76A)',
  error: 'var(--ethora-color-danger, #D92D20)',
  info: 'var(--ethora-color-primary, #0052CD)',
};

const TYPE_ICON: Record<ToastType['type'], string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

const ToastContainer = styled.div<{ $type: ToastType['type']; $duration: number }>`
  ${({ $duration }) => css`
    animation:
      ${slideUp} 200ms ${MOTION_EASE} forwards,
      ${slideDown} 200ms ${MOTION_EASE} forwards ${$duration - 200}ms;
  `}
  ${reducedMotion}
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--ethora-space-3, 12px);
  background-color: var(--ethora-color-bg, #fff);
  color: var(--ethora-color-text, #141414);
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  border-left: 3px solid ${({ $type }) => TYPE_ACCENT[$type]};
  padding: var(--ethora-space-3, 12px);
  border-radius: var(--ethora-radius-md, 12px);
  margin-top: 8px;
  width: 280px;
  overflow: hidden;
  box-shadow: var(--ethora-shadow-lg, 0 12px 32px rgba(16, 24, 40, 0.18));
`;

const IconBadge = styled.span<{ $type: ToastType['type'] }>`
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: var(--ethora-radius-full, 999px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  color: var(--ethora-color-text-on-primary, #fff);
  background-color: ${({ $type }) => TYPE_ACCENT[$type]};
`;

const Body = styled.div`
  flex: 1;
  min-width: 0;
`;

const Title = styled.strong`
  display: block;
  font-size: var(--ethora-font-size-sm, 14px);
  font-weight: 600;
`;

const Message = styled.p`
  margin: 2px 0 0;
  font-size: var(--ethora-font-size-xs, 12px);
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

const ProgressBar = styled.div<{ $duration: number; $type: ToastType['type'] }>`
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: ${({ $type }) => TYPE_ACCENT[$type]};
  opacity: 0.5;
  animation: ${({ $duration }) => progress($duration)} linear
    ${({ $duration }) => $duration}ms forwards;
  ${reducedMotion}
`;

const Toast: React.FC<ToastType> = ({
  title,
  message,
  type,
  duration = 3000,
}) => {
  return (
    <ToastContainer $type={type} $duration={duration}>
      <IconBadge $type={type} aria-hidden="true">
        {TYPE_ICON[type]}
      </IconBadge>
      <Body>
        <Title>{title}</Title>
        <Message>{message}</Message>
      </Body>
      <ProgressBar $type={type} $duration={duration} />
    </ToastContainer>
  );
};

export { Toast };
