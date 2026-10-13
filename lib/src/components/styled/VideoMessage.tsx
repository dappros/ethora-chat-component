import React from 'react';
import styled from 'styled-components';
import { useDispatch } from 'react-redux';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { setActiveFile, setActiveModal } from '../../roomStore/chatSettingsSlice';
import MediaSurface from './MediaSurface';

/** Full-size player used by the preview modal. Kept here with the bubble video. */
export const FullScreenVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: contain;
`;

interface CustomMessageVideoProps {
  fileName: string;
  fileURL: string;
  mimetype: string;
  /** Length in seconds, when the attachment recorded one. */
  duration?: string;
  width?: number;
  height?: number;
}

/**
 * A single video in a bubble: the first frame with a glass play button and,
 * when known, a duration chip. A click opens the preview modal, which holds
 * the controls.
 */
const CustomMessageVideo: React.FC<CustomMessageVideoProps> = ({
  fileName,
  fileURL,
  mimetype,
  duration,
  width,
  height,
}) => {
  const dispatch = useDispatch();

  const handleOpen = () => {
    dispatch(setActiveFile({ fileName, fileURL, mimetype }));
    dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
  };

  return (
    <MediaSurface
      kind="video"
      variant="solo"
      src={fileURL}
      alt={fileName}
      duration={duration}
      dims={{ width, height }}
      pending={false}
      onOpen={handleOpen}
    />
  );
};

export default CustomMessageVideo;
