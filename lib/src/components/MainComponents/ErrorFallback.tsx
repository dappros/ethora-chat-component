import React from 'react';
import Button from '../styled/Button';
import { OrDelimiter } from '../styled/StyledComponents';

interface ErrorFallbackProps {
  MainComponentStyles?: React.CSSProperties;
  message?: string;
  buttonLabel?: string;
  onButtonClick: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  MainComponentStyles,
  message = 'Error on loading chat. Please, try again later',
  buttonLabel = 'Enter with default account',
  onButtonClick,
}) => {
  return (
    <div
      style={{
        ...MainComponentStyles,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        padding: '20px',
        gap: '8px',
        fontSize: '14px',
      }}
    >
      <p>{message}</p>
      <OrDelimiter>Or</OrDelimiter>
      <Button
        onClick={onButtonClick}
        style={{ width: '100%', fontSize: '14px' }}
      >
        {buttonLabel}
      </Button>
    </div>
  );
};

export default ErrorFallback;
