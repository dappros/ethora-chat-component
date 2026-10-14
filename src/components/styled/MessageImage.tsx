import React from 'react';
import { useDispatch } from 'react-redux';
import { setActiveFile, setActiveModal } from '../../roomStore/chatSettingsSlice';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import MediaSurface from './MediaSurface';

interface CustomMessageImageProps {
  fileURL: string;
  fileName: string;
  mimetype: string;
  locationPreview?: string;
  /** Natural size from the attachment, when the storage kept it. */
  width?: number;
  height?: number;
  /** Sender's own blob URL, shown at once while the server copy loads. */
  localUrl?: string;
}

/**
 * A single picture in a bubble: its natural aspect ratio, sized to the
 * pane's shared media width. A click opens the preview modal at this file.
 */
const CustomMessageImage: React.FC<CustomMessageImageProps> = ({
  fileURL,
  fileName,
  mimetype,
  locationPreview,
  width,
  height,
  localUrl,
}) => {
  const dispatch = useDispatch();

  const handleOpen = () => {
    dispatch(setActiveFile({ fileName, fileURL, mimetype }));
    dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
  };

  return (
    <MediaSurface
      kind="image"
      variant="solo"
      src={fileURL}
      previewSrc={locationPreview}
      alt={fileName}
      mimetype={mimetype}
      dims={{ width, height }}
      localSrc={localUrl}
      pending={!fileURL}
      onOpen={handleOpen}
      openDisabled={!fileURL}
    />
  );
};

export default CustomMessageImage;
