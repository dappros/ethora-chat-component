import React, { useState } from 'react';
import {
  InputContainer,
  MessageInputContainer,
} from './StyledInputComponents/StyledInputComponents';
import { IConfig } from '../../types/types';
import MediaInput from '../InputComponents/MediaInput';
import AudioInput from '../InputComponents/AudioInput';
import TextInput from '../InputComponents/TextInput';

interface SendInputProps {
  sendMessage: (message: string) => void;
  sendMedia: (data: any, type: string) => void;
  isLoading: boolean;
  config?: IConfig;
}

const SendInput: React.FC<SendInputProps> = ({
  sendMessage,
  sendMedia,
  isLoading,
  config,
}) => {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [filePreviews, setFilePreviews] = useState<File[]>([]);

  const handleSendClick = (audioUrl?: string) => {
    if (filePreviews.length > 0) {
      sendMedia(filePreviews[0], 'media');
    } else if (audioUrl) {
      sendMedia(audioUrl, 'audio');
    } else {
      sendMessage(message);
    }
    setMessage('');
    setFilePreviews([]);
  };

  return (
    <InputContainer>
      <MessageInputContainer>
        <MediaInput
          filePreviews={filePreviews}
          setFilePreviews={setFilePreviews}
          handleSendClick={handleSendClick}
          config={config}
        />
        {message || filePreviews.length > 0 || config?.disableMedia ? (
          <TextInput
            message={message}
            setMessage={setMessage}
            handleSendClick={handleSendClick}
            config={config}
            isLoading={isLoading}
          />
        ) : (
          <AudioInput
            isRecording={isRecording}
            setIsRecording={setIsRecording}
            handleSendClick={handleSendClick}
          />
        )}
      </MessageInputContainer>
    </InputContainer>
  );
};

export default SendInput;
