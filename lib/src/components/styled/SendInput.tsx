import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import {
  FilePreview,
  FilePreviewContainer,
  HiddenFileInput,
  MessageInputContainer,
  VideoPreview,
  InputContainer,
  MessageInput,
  ImagePreview,
} from './StyledInputComponents/StyledInputComponents';
import AudioRecorder from '../InputComponents/AudioRecorder';
import { IConfig } from '../../types/types';
import Button from './Button';
import { AttachIcon, FileIcon, RemoveIcon, SendIcon } from '../../assets/icons';

interface SendInputProps {
  sendMessage: (message: string) => void;
  isLoading: boolean;
  editMessage?: string;
  sendMedia: (data: any, type: string) => void;
  config?: IConfig;
  onFocus?: () => void;
  onBlur?: () => void;
}

const SendInput: React.FC<SendInputProps> = ({
  sendMessage,
  sendMedia,
  onFocus,
  onBlur,
  config,
  editMessage,
  isLoading,
}) => {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const [filePreviews, setFilePreviews] = useState<File[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setFilePreviews((prevFiles) => {
          const fileSet = new Set(prevFiles.map((file) => file.name));

          const uniqueNewFiles = newFiles.filter(
            (newFile) => !fileSet.has(newFile.name)
          );
          let combinedFiles = [...prevFiles, ...uniqueNewFiles];

          if (combinedFiles.length > 5) {
            combinedFiles = combinedFiles?.slice(0, 5);
          }

          return combinedFiles;
        });
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    []
  );

  const handleFocus = () => {
    onFocus?.();
  };

  const handleBlur = () => {
    onBlur?.();
  };

  const handleRemoveFile = useCallback((file: File) => {
    setFilePreviews((prevFiles) => prevFiles.filter((f) => f !== file));
  }, []);

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setMessage(event.target.value);
    },
    []
  );

  useEffect(() => {
    setMessage(editMessage);
  }, [editMessage]);

  const handleSendClick = useCallback(
    (audioUrl?: string) => {
      if (filePreviews.length > 0) {
        console.log(filePreviews);
        console.log('Files sent:', filePreviews[0]);
        sendMedia(filePreviews[0], 'media');
        setIsRecording(false);
      } else if (audioUrl) {
        sendMedia(audioUrl, 'audio');
        console.log(audioUrl);
        console.log('Audio sent:', audioUrl);
        setIsRecording(false);
      } else {
        console.log('sending default', message);
        sendMessage(message);
      }
      setMessage('');
      setFilePreviews([]);
    },
    [filePreviews, message, sendMessage, sendMedia]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        if (filePreviews.length > 0 || message) {
          handleSendClick();
        }
      }
    },
    [handleSendClick]
  );

  const renderFilePreview = useCallback((file: File) => {
    const fileUrl = URL.createObjectURL(file);
    const fileType = file.type.split('/')[0];

    if (fileType === 'image') {
      return <ImagePreview src={fileUrl} alt={file.name} />;
    } else if (fileType === 'video') {
      return <VideoPreview src={fileUrl} controls />;
    } else {
      return <FileIcon alt={file.name} />;
    }
  }, []);

  const memoizedFilePreviews = useMemo(() => {
    return filePreviews.map(
      (file: any, idx: number) =>
        idx < 1 && (
          <FilePreview key={file.name}>
            {renderFilePreview(file)}
            <Button
              style={{
                position: 'absolute',
                backgroundColor: 'transparent',
                top: 4,
                right: 4,
                height: 16,
                width: 16,
              }}
              onClick={() => handleRemoveFile(file)}
              EndIcon={<RemoveIcon style={{ height: 16, width: 16 }} />}
            />
          </FilePreview>
        )
    );
  }, [filePreviews, renderFilePreview, handleRemoveFile]);

  return (
    <InputContainer>
      <MessageInputContainer>
        {!isRecording && (
          <>
            {!config?.disableMedia && (
              <Button
                onClick={handleAttachClick}
                disabled={false}
                EndIcon={<AttachIcon />}
              />
            )}
            <MessageInput
              color={config?.colors?.primary}
              placeholder="Type message"
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
              disabled={isLoading}
            />
          </>
        )}
        {message || filePreviews.length > 0 || config?.disableMedia ? (
          <Button
            onClick={() => handleSendClick()}
            // disabled={!message || message === ""}
            EndIcon={
              <SendIcon
                color={
                  filePreviews.length > 0
                    ? '#fff'
                    : !message || message === ''
                      ? '#D4D4D8'
                      : '#fff'
                }
              />
            }
            style={{
              borderRadius: '100px',
              backgroundColor:
                filePreviews.length > 0
                  ? config?.colors?.primary
                  : !message || message === ''
                    ? 'transparent'
                    : config?.colors?.primary,
            }}
          />
        ) : (
          <AudioRecorder
            setIsRecording={setIsRecording}
            isRecording={isRecording}
            handleSendClick={handleSendClick}
          />
        )}
      </MessageInputContainer>

      <HiddenFileInput
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
      />
      {filePreviews.length > 0 && (
        <FilePreviewContainer>{memoizedFilePreviews}</FilePreviewContainer>
      )}
    </InputContainer>
  );
};

export default SendInput;
