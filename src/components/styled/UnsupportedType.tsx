import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import { setActiveFile, setActiveModal } from '../../roomStore/chatSettingsSlice';
import { FileIcon } from '../../assets/icons';
import { formatFileName, formatFileSize, getFileExtension, isSvgFile } from '../../helpers/fileKind';
import { isSecureFileUrl, requestFileTokenRecovery } from '../../helpers/secureFileUrl';
import FileCard from './FileCard';

interface FileDownloadProps {
  fileName: string;
  fileURL: string;
  mimetype?: string;
  size?: string;
  locationPreview?: string;
}

/** Generic file in a bubble, as a card. A missing preview falls back to the type glyph. */
const FileDownload: React.FC<FileDownloadProps> = ({
  fileName,
  fileURL,
  mimetype,
  size,
  locationPreview,
}) => {
  const dispatch = useDispatch();
  const [previewBroken, setPreviewBroken] = useState(false);

  const handleOpen = () => {
    if (!fileURL) return;
    dispatch(setActiveFile({ fileName, fileURL, mimetype: mimetype || '' }));
    dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
  };

  const ext = getFileExtension(fileName).toUpperCase();
  const formattedSize = formatFileSize(size);
  // Never draw an SVG, even as a thumbnail: it is shown as a plain file.
  const showPreview =
    Boolean(locationPreview) &&
    !previewBroken &&
    !isSvgFile(mimetype, fileName) &&
    !isSvgFile(undefined, locationPreview?.split(/[?#]/)[0]);

  return (
    <FileCard
      name={formatFileName(fileName, 60)}
      meta={[ext || undefined, formattedSize || undefined]}
      icon={
        showPreview ? (
          <img
            src={locationPreview}
            alt=""
            onError={() => {
              if (isSecureFileUrl(locationPreview)) {
                requestFileTokenRecovery();
              }
              setPreviewBroken(true);
            }}
          />
        ) : (
          <FileIcon width={22} height={22} />
        )
      }
      onOpen={handleOpen}
      title={fileName}
      aria-label={fileName}
    />
  );
};

export default FileDownload;
