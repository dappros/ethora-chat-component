import React from 'react';
import styled from 'styled-components';

interface StyledInputProps {
  label?: string;
  color?: string;
  helperText?: string;
  error?: boolean;
  [key: string]: any;
}

const InputWrapper = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  width: 100%;
  justify-content: start;
  align-items: start;
`;

const Label = styled.label`
  font-size: 14px;
  color: #8c8c8c;
  margin-bottom: 4px;
  margin-left: 8px;
`;

const StyledInput = styled.input<{ color?: string; error?: boolean }>`
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid ${(props) => (props.error ? 'red' : 'transparent')};
  color: #141414;
  background-color: #f5f7f9;
  font-size: 16px;
  box-sizing: border-box;

  &:focus {
    border: 1px solid
      ${(props) => (props.error ? 'red' : props.color || '#0052CD')};
    outline: none;
    background-color: #f5f7f9;
  }
`;

const HelperText = styled.span<{ error?: boolean }>`
  font-size: 12px;
  color: ${(props) => (props.error ? 'red' : '#8c8c8c')};
  margin-top: 4px;
  margin-left: 8px;
  position: absolute;
  top: 42px;
`;

const InputWithLabel: React.FC<StyledInputProps> = ({
  label,
  color,
  helperText,
  error,
  ...rest
}) => {
  return (
    <InputWrapper>
      {label && <Label>{label}</Label>}
      <StyledInput color={color} error={error} {...rest} />
      {helperText && <HelperText error={error}>{helperText}</HelperText>}
    </InputWrapper>
  );
};

export default InputWithLabel;
