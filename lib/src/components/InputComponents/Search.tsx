import React, { useState, useEffect, useRef } from 'react';
import styled, { css } from 'styled-components';

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  animated?: boolean;
  direction?: 'left' | 'right';
}

const SearchInputWrapper = styled.div<{
  animated?: boolean;
  direction?: string;
  expanded?: boolean;
}>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f7f9;
  border-radius: 16px;
  height: 48px;
  padding: 0 16px;
  transition: width 0.7s ease-in-out;
  width: 100%;
  ${({ animated, direction, expanded }) =>
    animated &&
    css`
      width: ${expanded ? '300px' : '48px'};
      justify-content: 'center';
      cursor: pointer;

      padding: 0 ${expanded ? '16px' : '0'};
    `};
`;

const SearchIcon = styled.div<{ animated?: boolean; expanded?: boolean }>`
  padding: 3.5px;
  color: #999;
  cursor: pointer;
`;

const StyledInput = styled.input<{ animated?: boolean; expanded?: boolean }>`
  background-color: transparent;
  border: none;
  outline: none;
  width: ${({ animated, expanded }) =>
    animated ? (expanded ? '100%' : '0px') : '100%'};
  font-size: 16px;
  height: 48px;
  color: #000;
  transition:
    width 0.7s ease-in-out,
    padding 0.7s ease-in-out;
  opacity: ${({ animated, expanded }) => (animated ? (expanded ? 1 : 0) : 1)};
  z-index: 1;
  display: ${({ expanded, animated }) =>
    animated ? (expanded ? 'inherit' : 'none') : 'inherit'};

  &::placeholder {
    opacity: ${({ animated, expanded }) => (animated && !expanded ? 0 : 1)};
    transition: opacity 0.7s ease-in-out;
  }
`;

const SearchInput: React.FC<SearchInputProps> = ({
  icon,
  animated = false,
  direction = 'left',
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
      />
    </SearchInputWrapper>
  );
};

export { SearchInput };
