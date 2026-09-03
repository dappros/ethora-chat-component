import React, { ReactElement } from 'react';
import styled, { css } from 'styled-components';
import Loader from './Loader';
import { getTintedColor } from '../../helpers/getTintedColor';

/**
 * `$tone` layers on top of the existing `$variant` prop without changing
 * what any existing `$variant` value renders for callers that don't pass a
 * tone. 'danger' recolors filled/outlined/ghost around
 * --ethora-color-danger instead of the brand primary - used for destructive
 * modal actions (delete chat, block user, remove member, ...). 'ghost' is a
 * new ADDITIVE variant value (text-only, no border/background until hover);
 * it does not replace 'default'.
 */
const toneColor = ($tone: 'default' | 'danger' | undefined) =>
  $tone === 'danger'
    ? 'var(--ethora-color-danger, #D92D20)'
    : 'var(--ethora-color-primary, #0052CD)';

const CustomButton = styled.button<{
  disabled: boolean;
  $backgroundColor?: string;
  $unstyled?: boolean;
  $variant?: 'default' | 'filled' | 'outlined' | 'ghost';
  $tone?: 'default' | 'danger';
}>`
  border: ${({ $variant, $backgroundColor, $tone }) =>
    $variant === 'outlined'
      ? `1px solid ${$backgroundColor || toneColor($tone)}`
      : 'none'};
  border-radius: var(--ethora-radius-lg, 16px);
  background-size: contain;
  background-color: ${({ $variant, $backgroundColor, $tone }) =>
    $variant === 'filled' ? $backgroundColor || toneColor($tone) : 'transparent'};
  color: ${({ $variant, $backgroundColor, $tone }) =>
    $variant === 'filled'
      ? 'var(--ethora-color-text-on-primary, #FFFFFF)'
      : $variant === 'outlined' || $variant === 'ghost'
        ? $backgroundColor || toneColor($tone)
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
    background-color var(--ethora-motion-fast, 150ms),
    box-shadow var(--ethora-motion-fast, 150ms);

  ${({ $variant, $backgroundColor }) =>
    $variant === 'default' &&
    `
      border: none;
      background-color: ${$backgroundColor || 'transparent'};
      color: inherit;
  `}

  ${({ $variant }) =>
    $variant === 'ghost' &&
    css`
      background-color: transparent;
    `}

  &:hover {
    background-color: ${({ $variant, $backgroundColor, $tone }) =>
      $variant === 'filled'
        ? getTintedColor($backgroundColor || toneColor($tone))
        : $variant === 'outlined' || $variant === 'ghost'
          ? $tone === 'danger'
            ? 'rgba(217, 45, 32, 0.1)'
            : 'rgba(0, 82, 205, 0.1)'
          : $backgroundColor || 'rgba(202, 202, 202, 0.1)'};
    box-shadow: ${({ $variant }) =>
      $variant !== 'default' && $variant !== 'ghost'
        ? '0 4px 8px rgba(0, 0, 0, 0.2)'
        : 'none'};
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
  }

  &:disabled {
    background-color: ${({ $variant }) =>
      $variant === 'filled'
        ? '#e0e0e0'
        : $variant === 'default'
          ? 'white'
          : 'transparent'};
    color: #888;
    border-color: #e0e0e0;
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string | ReactElement;
  EndIcon?: ReactElement;
  StartIcon?: ReactElement;
  loading?: boolean;
  unstyled?: boolean;
  variant?: 'default' | 'filled' | 'outlined' | 'ghost';
  /** Recolors the button around the danger token for destructive actions. Optional, defaults to the existing brand-blue styling. */
  tone?: 'default' | 'danger';
  children?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  text,
  EndIcon,
  loading = false,
  disabled = false,
  unstyled = false,
  variant = 'default',
  tone = 'default',
  children,
  StartIcon,
  ...props
}, ref) => {
  return (
    <CustomButton
      ref={ref}
      disabled={disabled}
      $backgroundColor={props?.style?.backgroundColor}
      $unstyled={unstyled}
      $variant={variant}
      $tone={tone}
      {...props}
    >
      {!loading && StartIcon}
      {!loading && children}
      {loading ? <Loader size={24} /> : text}
      {!loading && EndIcon}
    </CustomButton>
  );
});

export default Button;
