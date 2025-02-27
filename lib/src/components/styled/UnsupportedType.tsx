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

interface FileDownloadProps {
  fileName: string;
  fileURL: string;
  mimetype: string;
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

  const formatFileSize = (sizeInBytes: string): string => {
    const size = parseInt(sizeInBytes, 10);

    if (isNaN(size)) {
      return 'Invalid size';
    }

    if (size < 1024) {
      return `${size} B`;
    } else if (size < 1024 ** 2) {
      return `${(size / 1024).toFixed(2)} KB`;
    } else if (size < 1024 ** 3) {
      return `${(size / 1024 ** 2).toFixed(2)} MB`;
    } else {
      return `${(size / 1024 ** 3).toFixed(2)} GB`;
    }
  };

  const formatFileName = (name: string, maxLength: number): string => {
    const dotIndex = name.lastIndexOf('.');
    const extension = dotIndex !== -1 ? name.substring(dotIndex) : '';

    const baseName = dotIndex !== -1 ? name.substring(0, dotIndex) : name;

    if (baseName.length + extension.length <= maxLength) {
      return name;
    }

    const shortenedBaseName = baseName.substring(
      0,
      maxLength - extension.length - 3
    );

    return `${shortenedBaseName}...${extension}`;
  };

  const handleOpen = () => {
    dispatch(setActiveFile({ fileName, fileURL, mimetype }));
    dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
  };

  return (
    <UnsupportedContainer onClick={handleOpen}>
      <BackgroundFile>
        {locationPreview ? (
          <img
            src={locationPreview}
            alt={fileName}
            onClick={handleOpen}
            style={{
              borderRadius: 16,
              cursor: 'pointer',
              maxWidth: '100px',
              maxHeight: '60px',
            }}
            onError={(e) => {
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
        {size && (
          <FileSizeContainer>
            <FileSize>{formatFileSize(size)}</FileSize>
          </FileSizeContainer>
        )}
      </FileInformation>
    </UnsupportedContainer>
  );
};

export default FileDownload;
