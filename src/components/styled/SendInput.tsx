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
import { useToast } from '../../context/ToastContext';

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
  const { showToast } = useToast();
  
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  const [filePreviews, setFilePreviews] = useState<File[]>([]);
  const [isLimitSize, setIsLimitSize] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAttachClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
          const file = event.target.files[0]; 
          setSelectedFile(file);
        } else {
          setSelectedFile(null);
        }

        event.target.value = ''; 

      // const files = event.target.files;
      // if (files) {
      //   const newFiles = Array.from(files);
      //   setFilePreviews((prevFiles) => {
      //     const fileSet = new Set(prevFiles.map((file) => file.name));

      //     const uniqueNewFiles = newFiles.filter(
      //       (newFile) => !fileSet.has(newFile.name)
      //     );
      //     let combinedFiles = [...prevFiles, ...uniqueNewFiles];

      //     if (combinedFiles.length > 5) {
      //       combinedFiles = combinedFiles?.slice(0, 5);
      //     }

      //     return combinedFiles;
      //   });
      // }

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
    setSelectedFile(null);
    // setFilePreviews((prevFiles) => prevFiles.filter((f) => f !== file));
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

  useEffect(() => {
    if (!selectedFile) {
      return; 
    }

    const MAX_TOTAL_SIZE_BYTES = 100 * 1024 * 1024;

    // const totalSize = filePreviews.reduce((sum, file) => {
    //   return sum + (file?.size || 0); 
    // }, 0);

    const totalSize = selectedFile?.size;

    if (totalSize > MAX_TOTAL_SIZE_BYTES) {
      setIsLimitSize(true);
      const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
      showToast({
        message: `Note: The total file size (${totalSizeMB} MB) exceeds the 100 MB limit.`,
        title: 'Error',
        type: 'error',
        id: 'file-size-error',
        duration: 3000,
      });
    } else {
      setIsLimitSize(false);
    }
  }, [selectedFile]);

  const handleSendClick = useCallback(
    (audioUrl?: string) => {
      if (selectedFile) {
        console.log(selectedFile);
        console.log('Files sent:', selectedFile);
        sendMedia(selectedFile, 'media');
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
      setSelectedFile(null);
    },
    [selectedFile, message, sendMessage, sendMedia]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        if (selectedFile || message) {
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
    if(selectedFile === null) return null;

    return (
      <FilePreview>
        {renderFilePreview(selectedFile)}
        <Button
          style={{
            position: 'absolute',
            backgroundColor: 'transparent',
            top: 4,
            right: 4,
            height: 16,
            width: 16,
          }}
          onClick={() => {
            handleRemoveFile(selectedFile)
            setIsLimitSize(false);
          }}
          EndIcon={<RemoveIcon style={{ height: 16, width: 16 }} />}
        />
      </FilePreview>
    );
  }, [selectedFile, renderFilePreview, handleRemoveFile]);

  // const memoizedFilePreviews = useMemo(() => {
  //   return filePreviews.map(
  //     (file: any, idx: number) =>
  //       idx < 1 && (
  //         <FilePreview key={file.name}>
  //           {renderFilePreview(file)}
  //           <Button
  //             style={{
  //               position: 'absolute',
  //               backgroundColor: 'transparent',
  //               top: 4,
  //               right: 4,
  //               height: 16,
  //               width: 16,
  //             }}
  //             onClick={() => {
  //               handleRemoveFile(file)
  //               setIsLimitSize(false);
  //             }}
  //             EndIcon={<RemoveIcon style={{ height: 16, width: 16 }} />}
  //           />
  //         </FilePreview>
  //       )
  //   );
  // }, [filePreviews, renderFilePreview, handleRemoveFile]);

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
        {message || selectedFile || config?.disableMedia ? (
          <Button
            onClick={() => handleSendClick()}
            disabled={isLimitSize}
            EndIcon={
              <SendIcon
                color={
                  selectedFile
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
                selectedFile
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
      {selectedFile && (
        <FilePreviewContainer>{memoizedFilePreviews}</FilePreviewContainer>
      )}
    </InputContainer>
  );
};

export default SendInput;
