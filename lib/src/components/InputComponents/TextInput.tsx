import React, { useCallback } from 'react';
import { SendIcon } from '../../assets/icons';
import { IConfig } from '../../types/types';
import Button from '../styled/Button';
import { MessageInput } from '../styled/StyledInputComponents/StyledInputComponents';

interface TextInputProps {
  message: string;
  setMessage: (value: string) => void;
  handleSendClick: () => void;
  isLoading: boolean;
  config?: IConfig;
  onFocus?: () => void;
  onBlur?: () => void;
}

const TextInput: React.FC<TextInputProps> = ({
  message,
  setMessage,
  handleSendClick,
  config,
  isLoading,
  onFocus,
  onBlur,
}) => {
  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setMessage(event.target.value);
    },
    [setMessage]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' && message) {
        handleSendClick();
      }
    },
    [handleSendClick, message]
  );

  return (
    <>
      <MessageInput
        color={config?.colors?.primary}
        placeholder="Type message"
        value={message}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        disabled={isLoading}
      />
      <Button
        onClick={handleSendClick}
        EndIcon={<SendIcon color={!message ? '#D4D4D8' : '#fff'} />}
        style={{
          borderRadius: '100px',
          backgroundColor: !message ? 'transparent' : config?.colors?.primary,
        }}
      />
    </>
  );
};

export default TextInput;
