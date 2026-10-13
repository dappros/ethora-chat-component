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
  /**
   * Called only once the server itself says the file is gone (404/410),
   * not merely when the <img> failed to load. The only known cause in
   * practice is the file having been deleted from the Files panel without
   * a matching message found locally to tombstone up front (see
   * FilesPanel.tsx's handleDelete) - the caller uses this to flip the
   * message to the normal "deleted" placeholder.
   */
  onUnavailable?: () => void;
}

/**
 * A single picture in a bubble: its natural aspect ratio, clamped to 320 x
 * 380. A click opens the preview modal at this file.
 */
const CustomMessageImage: React.FC<CustomMessageImageProps> = ({
  fileURL,
  fileName,
  mimetype,
  locationPreview,
  width,
  height,
  onUnavailable,
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
      dims={{ width, height }}
      pending={false}
      onOpen={handleOpen}
      onGone={onUnavailable}
    />
  );
};

export default CustomMessageImage;
