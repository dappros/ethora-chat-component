import React from 'react';
import styled from 'styled-components';

interface StyledInputProps {
  label: string;
  color?: string;
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

const StyledInput = styled.input<{ color?: string }>`
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid transparent;
  color: #141414;
  background-color: #f5f7f9;
  font-size: 16px;

  &:focus {
    border: 1px solid ${(props) => props.color || '#0052CD'};
    outline: none;
    background-color: #f5f7f9;
  }
`;

const InputWithLabel: React.FC<StyledInputProps> = ({
  label,
  color,
  ...rest
}) => {
  return (
    <InputWrapper>
      <Label>{label}</Label>
      <StyledInput color={color} {...rest} />
    </InputWrapper>
  );
};

export default InputWithLabel;
