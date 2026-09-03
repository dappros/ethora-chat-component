import React from 'react';

import {
  BackgroundFile,
  FileInformation,
  FileName,
  FileSize,
  FileSizeContainer,
  UnsupportedContainer,
} from './StyledInputComponents/MediaComponents';
import { useDispatch } from 'react-redux';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import {
  setActiveFile,
  setActiveModal,
} from '../../roomStore/chatSettingsSlice';
import { FileIcon } from '../../assets/icons';
import { formatFileName, formatFileSize } from '../../helpers/fileKind';
import {
  isSecureFileUrl,
  requestFileTokenRecovery,
} from '../../helpers/secureFileUrl';

interface FileDownloadProps {
  fileName: string;
  fileURL: string;
  mimetype?: string;
  size?: string;
  locationPreview?: string;
}

const FileDownload: React.FC<FileDownloadProps> = ({
  fileName,
  fileURL,
  mimetype,
  size,
  locationPreview,
}) => {
  const dispatch = useDispatch();

  const handleOpen = () => {
    if (!fileURL) return;
    dispatch(setActiveFile({ fileName, fileURL, mimetype: mimetype || '' }));
    dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
  };

  const formattedSize = formatFileSize(size);

  return (
    <UnsupportedContainer onClick={handleOpen} title={fileName}>
      <BackgroundFile>
        {locationPreview ? (
          <img
            src={locationPreview}
            alt={fileName}
            style={{
              borderRadius: 'var(--ethora-radius-sm, 8px)',
              cursor: 'pointer',
              maxWidth: '100px',
              maxHeight: '60px',
            }}
            onError={(e) => {
              if (isSecureFileUrl(locationPreview)) {
                requestFileTokenRecovery();
              }
              (e.target as HTMLImageElement).src =
                'https://as2.ftcdn.net/v2/jpg/02/51/95/53/1000_F_251955356_FAQH0U1y1TZw3ZcdPGybwUkH90a3VAhb.jpg';
            }}
          />
        ) : (
          <FileIcon />
        )}
      </BackgroundFile>
      <FileInformation>
        <FileName>{formatFileName(fileName, 20)}</FileName>
        {formattedSize && (
          <FileSizeContainer>
            <FileSize>{formattedSize}</FileSize>
          </FileSizeContainer>
        )}
      </FileInformation>
    </UnsupportedContainer>
  );
};

export default FileDownload;
