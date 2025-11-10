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
import { TextareaInput, TextareaWrapper } from './StyledInputComponents/StyledInputComponents';
import AudioRecorder from '../InputComponents/AudioRecorder';
import { IConfig } from '../../types/types';
import Button from './Button';
import { AttachIcon, FileIcon, RemoveIcon, SendIcon } from '../../assets/icons';
import { parseMessageBody } from '../../helpers/parseMessageBody';

interface SendInputProps {
  sendMessage: (message: string) => void;
  isLoading: boolean;
  editMessage?: string;
  sendMedia: (data: any, type: string) => void;
  config?: IConfig;
  onFocus?: () => void;
  onBlur?: () => void;
  isMessageProcessing?: boolean;
  formatMessage?: (text: string) => string;
  multiline?: boolean;
  inputHeight?: number;
  showPreview?: boolean;
  previewParser?: (text: string) => (string | JSX.Element)[];
}

const SendInput: React.FC<SendInputProps> = ({
  sendMessage,
  sendMedia,
  onFocus,
  onBlur,
  config,
  editMessage,
  isLoading,
  isMessageProcessing,
  formatMessage,
  multiline,
  inputHeight,
  showPreview,
  previewParser,
}) => {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState(40);
  const [isFocused, setIsFocused] = useState(false);

  const [filePreviews, setFilePreviews] = useState<File[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    setIsFocused(true);
    onFocus?.();
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();
  };

  const handleRemoveFile = useCallback((file: File) => {
    setFilePreviews((prevFiles) => prevFiles.filter((f) => f !== file));
  }, []);

  const calculateTextareaHeight = useCallback(
    (text: string) => {
      if (!multiline) return 40;

      const lineBreaks = (text.match(/\n/g) || []).length;
      const baseHeight = 40;
      const heightPerLine = 13;
      const maxHeight = 92;

      const calculatedHeight = baseHeight + lineBreaks * heightPerLine;
      return Math.min(Math.max(calculatedHeight, baseHeight), maxHeight);
    },
    [multiline]
  );

  const updateTextareaHeight = useCallback(
    (text: string) => {
      const newHeight = calculateTextareaHeight(text);
      setTextareaHeight(newHeight);
    },
    [calculateTextareaHeight]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const newValue = event.target.value;
      setMessage(newValue);
      updateTextareaHeight(newValue);
    },
    [updateTextareaHeight]
  );

  useEffect(() => {
    setMessage(editMessage);
    if (editMessage) {
      updateTextareaHeight(editMessage);
    }
  }, [editMessage, updateTextareaHeight]);

  const handleSendClick = useCallback(
    (audioUrl?: string) => {
      if (filePreviews.length > 0) {
        sendMedia(filePreviews[0], 'media');
        setIsRecording(false);
      } else if (audioUrl) {
        sendMedia(audioUrl, 'audio/');
        setIsRecording(false);
      } else {
        const outgoing = formatMessage ? formatMessage(message) : message;
        sendMessage(outgoing);
      }
      setMessage('');
      setFilePreviews([]);
      setTextareaHeight(40); // Reset height to default
    },
    [filePreviews, message, sendMessage, sendMedia, formatMessage]
  );

  const handleSecondaryClick = useCallback(() => {
    const outgoingBase = config.secondarySendButton.messageEdit + message;
    const outgoing = formatMessage ? formatMessage(outgoingBase) : outgoingBase;
    sendMessage(outgoing);
    setMessage('');
    setFilePreviews([]);
    setTextareaHeight(40);
  }, [
    filePreviews,
    message,
    sendMessage,
    sendMedia,
    config?.secondarySendButton?.messageEdit,
    formatMessage,
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key !== 'Enter') return;

      const hasContent = filePreviews.length > 0 || !!message;
      if (!hasContent) return;

      if (multiline) {
        if (event.shiftKey) return;
        event.preventDefault();
      }

      if (config?.secondarySendButton?.overwriteEnterClick) {
        handleSecondaryClick();
      } else {
        handleSendClick();
      }
    },
    [
      config?.secondarySendButton?.overwriteEnterClick,
      handleSendClick,
      handleSecondaryClick,
      filePreviews.length,
      message,
      multiline,
    ]
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
            {multiline ? (
              <TextareaWrapper 
                dynamicHeight={textareaHeight}
                color={config?.colors?.primary}
                isFocused={isFocused}
              >
                <TextareaInput
                  ref={textareaRef}
                  placeholder="Type message"
                  value={message}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  disabled={isLoading || isMessageProcessing}
                  color={config?.colors?.primary}
                />
              </TextareaWrapper>
            ) : (
              <MessageInput
                color={config?.colors?.primary}
                placeholder="Type message"
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
                disabled={isLoading || isMessageProcessing}
                style={{
                  height: inputHeight,
                  maxHeight: inputHeight || '40px',
                }}
              />
            )}
          </>
        )}
        {message || filePreviews.length > 0 || config?.disableMedia ? (
          <>
            {config?.secondarySendButton?.enabled && (
              <Button
                onClick={() => handleSecondaryClick()}
                disabled={
                  isMessageProcessing || (!message && filePreviews.length === 0)
                }
                style={{
                  color:
                    filePreviews.length > 0
                      ? '#fff'
                      : !message || message === ''
                        ? '#D4D4D8'
                        : '#fff',
                  borderRadius: '100px',
                  backgroundColor:
                    filePreviews.length > 0
                      ? config?.colors?.primary
                      : !message || message === ''
                        ? 'transparent'
                        : config?.colors?.primary,
                  ...config?.secondarySendButton.buttonStyles,
                }}
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
              >
                {config?.secondarySendButton?.label}
              </Button>
            )}
            {config?.secondarySendButton?.hideInputSendButton ? null : (
              <Button
                onClick={() => handleSendClick()}
                disabled={message === '' || isMessageProcessing}
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
            )}
          </>
        ) : (
          <AudioRecorder
            setIsRecording={setIsRecording}
            isRecording={isRecording}
            handleSendClick={handleSendClick}
          />
        )}
      </MessageInputContainer>

      {multiline && showPreview && message && (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            backgroundColor: '#fafafa',
            border: '1px solid #E4E4E7',
            borderRadius: 12,
            color: '#141414',
          }}
        >
          {
            (previewParser || ((text: string) => parseMessageBody({ text })))(
              message
            ) as React.ReactNode
          }
        </div>
      )}

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
