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
        padding: 'var(--ethora-space-5, 20px)',
        gap: 'var(--ethora-space-2, 8px)',
        fontSize: 'var(--ethora-font-size-sm, 14px)',
      }}
    >
      <p
        style={{
          fontFamily:
            'var(--ethora-font-family, Inter, Arial, sans-serif)',
          fontSize: 'var(--ethora-font-size-sm, 14px)',
          color: 'var(--ethora-color-text-secondary, #5A5F66)',
          textAlign: 'center',
        }}
      >
        {message}
      </p>

      <OrDelimiter>Or</OrDelimiter>
      <Button
        variant="filled"
        onClick={onButtonClick}
        style={{
          width: '100%',
          borderRadius: 'var(--ethora-radius-sm, 8px)',
          fontFamily:
            'var(--ethora-font-family, Inter, Arial, sans-serif)',
          fontSize: 'var(--ethora-font-size-sm, 14px)',
        }}
      >
        {buttonLabel}
      </Button>
    </div>
  );
};

export default ErrorFallback;
