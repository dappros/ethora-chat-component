import styled from 'styled-components';

export const Container = styled.div`
  margin: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const FullScreenVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

export const FixedSizeVideo = styled.video`
  width: 300px;
  height: 200px;
  object-fit: cover;
`;

export const ModalContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border-radius: 10px;
`;

export const ButtonContainer = styled.div`
  display: flex;
  position: absolute;
  top: 8px;
  right: 8px;
`;

export const IconButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ethora-color-icons, gray);
  font-size: 36px;
  display: flex;
  align-items: center;
  gap: 5px;
  pointer-events: auto;
  border-radius: var(--ethora-radius-sm, 8px);
  transition: background-color var(--ethora-motion-fast, 150ms)
    var(--ethora-motion-ease, ease);

  &:hover {
    background-color: var(--ethora-color-bg-hover, rgba(0, 0, 0, 0.06));
  }
`;
