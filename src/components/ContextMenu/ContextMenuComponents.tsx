import styled from 'styled-components';
import Picker from '@emoji-mart/react';

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
  background-color: #ffffff;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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

export const StyledPicker = styled(Picker)`
  .emoji-mart-preview {
    display: none;
  }
`;

export const ContextMenu = styled.div`
  position: absolute;
  z-index: 1000;
  max-width: 240px;
  margin-top: 16px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0px 0px 6px -2px #12121908;
  box-shadow: 0px 0px 16px -4px #12121914;
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const MenuItem = styled.div`
  padding: 8px 8px;
  cursor: pointer;
  &:hover {
    background-color: #f0f0f0;
  }
  min-width: 208px;
  display: flex;
  text-align: start;
  justify-content: space-between;
  align-items: center;
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
  border: 1px solid var(--colors-background-bg-prymary-5, #0052cd0d);
`;
