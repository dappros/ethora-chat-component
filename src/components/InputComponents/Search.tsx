import React, { useState, useEffect, useRef } from 'react';
import styled, { css } from 'styled-components';

const shouldForwardProp = (prop: string) =>
  prop !== 'animated' && prop !== 'expanded' && prop !== 'direction';

const SearchInputWrapper = styled.div.withConfig({ shouldForwardProp })<{
  animated?: boolean;
  direction?: string;
  expanded?: boolean;
  $colorBg?: string;
}>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: ${({ $colorBg }) => ($colorBg ? $colorBg : 'var(--ethora-color-bg-subtle, #f5f7f9)')};
  border: 1px solid var(--ethora-color-border, #e6e8ec);
  border-radius: var(--ethora-radius-md, 16px);
  height: 48px;
  padding: 0 16px;
  /* width:100% + 16px of padding either side + a 1px border is 34px wider
     than the space it was given, so this box always overflowed its parent -
     visible as the search field being clipped at the right edge inside the
     room profile's members card. Sizing the padding and border INTO the
     100% is what the layout always meant. */
  box-sizing: border-box;
  transition:
    width 0.7s ease-in-out,
    border-color var(--ethora-motion-fast, 150ms) var(--ethora-motion-ease, ease);
  width: 100%;

  &:focus-within {
    border-color: var(--ethora-color-primary, #0052cd);
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 1px;
  }

  ${({ animated, expanded }) =>
    animated &&
    css`
      width: ${expanded ? '300px' : '48px'};
      justify-content: center;
      cursor: pointer;
      padding: 0 ${expanded ? '16px' : '0'};
    `};
`;

const SearchIcon = styled.div.withConfig({ shouldForwardProp })<{
  animated?: boolean;
  expanded?: boolean;
}>`
  padding: 3.5px;
  color: var(--ethora-color-text-muted, #999);
  cursor: pointer;
`;

const StyledInput = styled.input.withConfig({ shouldForwardProp })<{
  animated?: boolean;
  expanded?: boolean;
}>`
  background-color: transparent;
  border: none;
  outline: none;
  width: ${({ animated, expanded }) =>
    animated ? (expanded ? '100%' : '0px') : '100%'};
  font-size: var(--ethora-font-size, 16px);
  height: 48px;
  color: var(--ethora-color-text, #000);
  transition:
    width 0.7s ease-in-out,
    padding 0.7s ease-in-out;
  opacity: ${({ animated, expanded }) => (animated ? (expanded ? 1 : 0) : 1)};
  z-index: 1;
  display: ${({ animated, expanded }) =>
    animated ? (expanded ? 'inherit' : 'none') : 'inherit'};

  &::placeholder {
    opacity: ${({ animated, expanded }) => (animated && !expanded ? 0 : 1)};
    transition: opacity 0.7s ease-in-out;
  }
`;

const ClearButton = styled.button`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  min-width: 28px;
  margin-left: 4px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--ethora-color-text-muted, #999);
  cursor: pointer;
  z-index: 1;

  &:hover {
    background: var(--ethora-color-bg-hover, #f0f2f5);
  }

  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 1px;
  }
`;

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  animated?: boolean;
  direction?: 'left' | 'right';
  colorBg?: string;
  /** When set, a clear button shows while the input has text. */
  onClear?: () => void;
  /** Accessible label for the clear button (pass a translated string). */
  clearLabel?: string;
}

const SearchInput: React.FC<SearchInputProps> = ({
  icon,
  animated = false,
  direction = 'left',
  colorBg,
  onClear,
  clearLabel = 'Clear search',
  ...props
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFocus = () => {
    setIsExpanded(true);
  };

  const handleBlur = () => {
    if (!isTyping) {
      setIsExpanded(false);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsTyping(!!e.target.value);
  };

  const handleClear = () => {
    onClear?.();
    setIsTyping(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    props.onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Escape' && onClear && hasText) {
      e.preventDefault();
      e.stopPropagation();
      handleClear();
    }
  };

  const hasText = String(props.value ?? '').length > 0;

  useEffect(() => {
    if (isExpanded && animated) {
      const timeout = setTimeout(() => {
        inputRef.current?.focus();
      }, 250);
      return () => clearTimeout(timeout);
    }
  }, [isExpanded, animated]);

  return (
    <SearchInputWrapper
      animated={animated}
      direction={direction}
      expanded={isExpanded}
      $colorBg={colorBg}
      onClick={handleFocus}
    >
      {icon && (
        <SearchIcon
          animated={animated}
          expanded={isExpanded}
          onClick={() => inputRef.current?.focus()}
        >
          {icon}
        </SearchIcon>
      )}
      <StyledInput
        ref={inputRef}
        onBlur={handleBlur}
        animated={animated}
        expanded={isExpanded}
        onInput={handleInput}
        {...props}
        onKeyDown={handleKeyDown}
      />
      {onClear && hasText && (
        <ClearButton
          type="button"
          aria-label={clearLabel}
          onClick={(e) => {
            e.stopPropagation();
            handleClear();
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </ClearButton>
      )}
    </SearchInputWrapper>
  );
};

export { SearchInput };
