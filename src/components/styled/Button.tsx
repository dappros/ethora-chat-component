import React, { ReactElement } from 'react';
import styled from 'styled-components';
import Loader from './Loader';
import { getTintedColor } from '../../helpers/getTintedColor';

const CustomButton = styled.button<{
  disabled: boolean;
  backgroundColor?: string;
  unstyled?: boolean;
  variant?: 'default' | 'filled' | 'outlined';
}>`
  border: ${({ variant, backgroundColor }) =>
    variant === 'outlined'
      ? `1px solid ${backgroundColor || '#0052CD'}`
      : 'none'};
  border-radius: 16px;
  background-size: contain;
  background-color: ${({ variant, backgroundColor }) =>
    variant === 'filled' ? backgroundColor || '#0052CD' : 'transparent'};
  color: ${({ variant, backgroundColor }) =>
    variant === 'filled'
      ? '#FFFFFF'
      : variant === 'outlined'
        ? backgroundColor || '#0052CD'
        : 'inherit'};
  cursor: pointer;
  height: 40px;
  width: 40px;
  padding: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  transition:
    background-color 0.3s,
    box-shadow 0.3s;

  ${({ variant, backgroundColor }) =>
    variant === 'default' &&
    `
      border: none;
      background-color: ${backgroundColor || 'transparent'};
      color: inherit;
  `}

  &:hover {
    background-color: ${({ variant, backgroundColor }) =>
      variant === 'filled'
        ? getTintedColor(backgroundColor || '#0052CD')
        : variant === 'outlined'
          ? 'rgba(0, 82, 205, 0.1)'
          : backgroundColor || 'rgba(202, 202, 202, 0.1)'};
    box-shadow: ${({ variant }) =>
      variant !== 'default' ? '0 4px 8px rgba(0, 0, 0, 0.2)' : 'none'};
  }

  &:disabled {
    background-color: ${({ variant }) =>
      variant === 'filled'
        ? '#e0e0e0'
        : variant === 'default'
          ? 'white'
          : 'transparent'};
    color: #888;
    border-color: #e0e0e0;
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string | ReactElement;
  EndIcon?: ReactElement;
  StartIcon?: ReactElement;
  loading?: boolean;
  unstyled?: boolean;
  variant?: 'default' | 'filled' | 'outlined';
  children?: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  text,
  EndIcon,
  loading = false,
  disabled = false,
  unstyled = false,
  variant = 'default',
  children,
  StartIcon,
  ...props
}) => {
  return (
    <CustomButton
      disabled={disabled}
      backgroundColor={props?.style?.backgroundColor}
      unstyled={unstyled}
      variant={variant}
      {...props}
    >
      {!loading && StartIcon}
      {!loading && children}
      {loading ? <Loader size={24} /> : text}
      {!loading && EndIcon}
    </CustomButton>
  );
};

export default Button;
