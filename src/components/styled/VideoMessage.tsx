import React from 'react';
import styled from 'styled-components';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { useDispatch } from 'react-redux';
import {
  setActiveFile,
  setActiveModal,
} from '../../roomStore/chatSettingsSlice';

interface CustomMessageVideoProps {
  fileName: string;
  fileURL: string;
  mimetype: string;
}

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
  color: gray;
  font-size: 36px;
  display: flex;
  align-items: center;
  gap: 5px;
  pointer-events: auto;
`;

const CustomMessageVideo: React.FC<CustomMessageVideoProps> = ({
  fileName,
  fileURL,
  mimetype,
}) => {
  const dispatch = useDispatch();

  const handleOpen = (e: React.MouseEvent<HTMLVideoElement, MouseEvent>) => {
    dispatch(setActiveFile({ fileName, fileURL, mimetype }));
    dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Container>
      <FixedSizeVideo
        src={fileURL}
        controls
        autoPlay={false}
        onClick={(e) => handleOpen(e)}
        style={{ cursor: 'pointer', maxWidth: '100%' }}
      />
    </Container>
  );
};

export default CustomMessageVideo;
