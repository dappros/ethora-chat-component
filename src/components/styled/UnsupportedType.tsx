import React from 'react';

import {
  FileName,
  UnsupportedContainer,
} from './StyledInputComponents/MediaComponents';
import { IconButton } from './StyledComponents';
import { DownloadIcon } from '../../assets/icons';
import { IConfig } from '../../types/types';
import { ActionButton } from './ActionButton';
import { useDispatch } from 'react-redux';
import { MODAL_TYPES } from '../../helpers/constants/MODAL_TYPES';
import {
  setActiveFile,
  setActiveModal,
} from '../../roomStore/chatSettingsSlice';

interface FileDownloadProps {
  fileName: string;
  fileURL: string;
  mimetype: string;
}

const FileDownload: React.FC<FileDownloadProps> = ({
  fileName,
  fileURL,
  mimetype,
}) => {
  const dispatch = useDispatch();

  const handleOpen = () => {
    dispatch(setActiveFile({ fileName, fileURL, mimetype }));
    dispatch(setActiveModal(MODAL_TYPES.FILE_PREVIEW));
  };

  return (
    <UnsupportedContainer onClick={handleOpen}>
      <FileName>{fileName}</FileName>
    </UnsupportedContainer>
  );
};

export default FileDownload;
