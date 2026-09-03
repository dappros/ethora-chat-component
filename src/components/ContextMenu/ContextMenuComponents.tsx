import styled from 'styled-components';
import { scaleInAnimation } from '../../styles/motion';

export const ContainerInteractions = styled.div`
  position: absolute;
  z-index: 1000;
`;

export const ReactionContainer = styled.div`
  max-width: 245px;
  display: flex;
  margin-bottom: 16px;
  gap: 8px;
  padding: 8px;
  justify-content: space-around;
  background-color: var(--ethora-color-bg, #fff);
  border-radius: var(--ethora-radius-md, 12px);
  box-shadow: var(--ethora-shadow-md, 0 4px 12px rgba(16, 24, 40, 0.1));
  ${scaleInAnimation}
`;

export const ReactionBadge = styled.span`
  font-size: 22px;
  cursor: pointer;
  transition: transform 0.2s ease;

  &:hover {
    transform: scale(1.2);
  }
`;

export const ArrowButton = styled.div<{ isRotated: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.3s ease;

  transform: ${({ isRotated }) =>
    isRotated ? 'rotate(180deg)' : 'rotate(0deg)'};
`;

export const ContextMenu = styled.div`
  max-width: 240px;
  background-color: var(--ethora-color-bg, #fff);
  margin-top: 16px;
  border-radius: var(--ethora-radius-md, 12px);
  box-shadow: var(--ethora-shadow-md, 0 4px 12px rgba(16, 24, 40, 0.1));
  padding: var(--ethora-space-2, 8px) var(--ethora-space-3, 12px);
  display: flex;
  flex-direction: column;
  gap: 4px;
  transform-origin: top left;
  ${scaleInAnimation}
`;

export const MenuItem = styled.div`
  padding: var(--ethora-space-2, 8px);
  cursor: pointer;
  border-radius: var(--ethora-radius-sm, 8px);
  transition: background var(--ethora-motion-fast, 150ms);
  min-width: 208px;
  display: flex;
  text-align: start;
  justify-content: space-between;
  align-items: center;

  &:hover {
    background-color: var(--ethora-color-bg-hover, #f0f2f5);
  }
`;

export const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  background: #000;
  background-color: transparent;
`;

export const Delimeter = styled.div`
  border: 1px solid var(--ethora-color-border, #e6e8ec);
`;
