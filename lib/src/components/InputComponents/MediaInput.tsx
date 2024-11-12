import React, { useCallback } from 'react';
import { AttachIcon, RemoveIcon } from '../../assets/icons';
import { IConfig } from '../../types/types';
import Button from '../styled/Button';
import {
  FilePreview,
  FilePreviewContainer,
  HiddenFileInput,
} from '../styled/StyledInputComponents/StyledInputComponents';

interface MediaInputProps {
  filePreviews: File[];
  setFilePreviews: any;
  handleSendClick: () => void;
  config?: IConfig;
}

const MediaInput: React.FC<MediaInputProps> = ({
  filePreviews,
  setFilePreviews,
  handleSendClick,
  config,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleAttachClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files) {
        const newFiles = Array.from(files);
        setFilePreviews((prevFiles: any) =>
          [...prevFiles, ...newFiles].slice(0, 5)
        );
      }
    },
    [setFilePreviews]
  );

  const handleRemoveFile = useCallback(
    (file: File) => {
      setFilePreviews((prevFiles: File[]) =>
        prevFiles.filter((f) => f !== file)
      );
    },
    [setFilePreviews]
  );

  const renderFilePreview = useCallback((file: File) => {
    const fileUrl = URL.createObjectURL(file);
    const fileType = file.type.split('/')[0];
    if (fileType === 'image') {
      return <img src={fileUrl} alt={file.name} style={{ width: '50px' }} />;
    } else if (fileType === 'video') {
      return <video src={fileUrl} controls style={{ width: '50px' }} />;
    }
    return null;
  }, []);

  return (
    <>
      <Button
        onClick={handleAttachClick}
        disabled={config?.disableMedia}
        EndIcon={<AttachIcon />}
      />
      <HiddenFileInput
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
      />
      {filePreviews.length > 0 && (
        <FilePreviewContainer>
          {filePreviews.map((file) => (
            <FilePreview key={file.name}>
              {renderFilePreview(file)}
              <Button
                onClick={() => handleRemoveFile(file)}
                EndIcon={<RemoveIcon />}
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  height: 16,
                  width: 16,
                }}
              />
            </FilePreview>
          ))}
        </FilePreviewContainer>
      )}
    </>
  );
};

export default MediaInput;
