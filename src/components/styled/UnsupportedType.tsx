import React from 'react';

import {
  FileName,
  UnsupportedContainer,
} from './StyledInputComponents/MediaComponents';
import { IconButton } from './StyledComponents';
import { DownloadIcon } from '../../assets/icons';
import { IConfig } from '../../types/types';
import { ActionButton } from './ActionButton';

interface FileDownloadProps {
  fileUrl: string;
  fileName: string;
  config?: IConfig;
}

const downloadFile = (fileUrl: string, fileName: string) => {
  fetch(fileUrl, {
    method: 'GET',
    headers: {},
  })
    .then((response) => {
      response.arrayBuffer().then(function (buffer) {
        const url = window.URL.createObjectURL(new Blob([buffer]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
      });
    })
    .catch((err) => {
      console.error(err);
    });
};

const FileDownload: React.FC<FileDownloadProps> = ({
  fileUrl,
  fileName,
  config,
}) => {
  return (
    <UnsupportedContainer onClick={() => downloadFile(fileUrl, fileName)}>
      <FileName>{fileName}</FileName>
    </UnsupportedContainer>
  );
};

export default FileDownload;
