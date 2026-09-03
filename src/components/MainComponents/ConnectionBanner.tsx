import React from 'react';
import styled, { keyframes } from 'styled-components';
import { MOTION_EASE, reducedMotion } from '../../styles/motion';

const slideDown = keyframes`
  from {
    opacity: 0;
    transform: translateY(-100%);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const BannerContainer = styled.div`
  background-color: var(--ethora-color-danger, #d92d20);
  color: var(--ethora-color-text-on-primary, #fff);
  padding: var(--ethora-space-2, 8px) var(--ethora-space-4, 16px);
  text-align: center;
  font-family: var(--ethora-font-family, 'Inter', sans-serif);
  font-size: var(--ethora-font-size-sm, 14px);
  font-weight: 500;
  width: 100%;
  box-sizing: border-box;
  z-index: 1000;
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 0 0 var(--ethora-radius-md, 12px) var(--ethora-radius-md, 12px);
  box-shadow: var(--ethora-shadow-sm, 0 1px 4px rgba(16, 24, 40, 0.08));
  animation: ${slideDown} var(--ethora-motion-base, 220ms) ${MOTION_EASE} both;
  ${reducedMotion}
`;

interface ConnectionBannerProps {
  message?: string;
}

const ConnectionBanner: React.FC<ConnectionBannerProps> = ({
  message = 'Connection lost. Retrying...',
}) => {
  return <BannerContainer>{message}</BannerContainer>;
};

export default ConnectionBanner;
