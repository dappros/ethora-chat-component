import React, { useState } from "react";
import styled, { css } from "styled-components";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  animated?: boolean;
  direction?: "left" | "right";
}

const SearchInputWrapper = styled.div<{
  animated?: boolean;
  direction?: string;
  expanded?: boolean;
}>`
  position: relative;
  display: flex;
  align-items: center;
  background-color: #f5f7f9;
  border-radius: 16px;
  height: 48px;
  padding: 0 16px;
  transition: width 0.7s ease-in-out;
  width: 100%;
  ${({ animated, direction, expanded }) =>
    animated &&
    css`
      width: ${expanded ? "300px" : "48px"};
      justify-content: ${direction === "right" ? "flex-start" : "flex-end"};
      cursor: pointer;

      padding: 0 ${expanded ? "16px" : "0"};
    `};
`;

const SearchIcon = styled.div<{
  animated?: boolean;
  expanded?: boolean;
  direction?: string;
}>`
  position: absolute;
  color: #999;
  left: ${({ animated, direction }) =>
    !animated || direction === "left" ? "16px" : "auto"};
  right: ${({ animated, direction }) =>
    animated && direction === "right" ? "16px" : "auto"};
  opacity: ${({ expanded }) => (expanded ? 0 : 1)};
`;

const StyledInput = styled.input<{ animated?: boolean; expanded?: boolean }>`
  background-color: transparent;
  border: none;
  outline: none;
  padding-left: ${({ animated, expanded }) =>
    animated && expanded ? "16px" : "0"};
  width: ${({ animated, expanded }) =>
    animated ? (expanded ? "100%" : "0") : "100%"};
  font-size: 16px;
  height: 48px;
  color: #000;
  transition: width 0.7s ease-in-out, padding 0.7s ease-in-out;
  opacity: ${({ expanded }) => (expanded ? 1 : 0)};

  &::placeholder {
    color: #999;
    font-size: 16px;
  }
`;

const SearchInput: React.FC<SearchInputProps> = ({
  icon,
  animated = false,
  direction = "left",
  ...props
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleFocus = () => {
    setIsExpanded(true);
  };

  const handleBlur = () => {
    setIsExpanded(false);
  };

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
          direction={direction}
        >
          {icon}
        </SearchIcon>
      )}
      <StyledInput
        placeholder={"Search..."}
        onBlur={handleBlur}
        animated={animated}
        expanded={isExpanded}
        autoFocus={true}
        {...props}
      />
    </SearchInputWrapper>
  );
};

export { SearchInput };
