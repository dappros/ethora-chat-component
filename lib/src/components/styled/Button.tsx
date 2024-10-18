import React, { ReactElement } from "react";
import styled from "styled-components";
import Loader from "./Loader";
import { getTintedColor } from "../../helpers/getTintedColor";

// Styled button inheriting from the HTML button
const CustomButton = styled.button<{
  disabled: boolean;
  backgroundColor?: string;
  unstyled?: boolean;
}>`
  border: none;
  border-radius: 16px;
  background-size: contain;
  cursor: pointer;
  height: 40px;
  width: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0;
  transition: background-color 0.3s, box-shadow 0.3s;
  background-color: ${({ unstyled, backgroundColor }) =>
    unstyled ? "transparent" : backgroundColor || "transparent"};

  &:hover {
    background-color: ${({ unstyled, backgroundColor }) =>
      unstyled
        ? "transparent"
        : getTintedColor(backgroundColor ? backgroundColor : "#0052CD")};
    box-shadow: ${({ unstyled }) =>
      unstyled ? "none" : "0 4px 8px rgba(0, 0, 0, 0.2)"};
  }

  &:active {
    background-color: ${({ unstyled }) =>
      unstyled ? "transparent" : undefined};
    box-shadow: ${({ unstyled }) => (unstyled ? "none" : undefined)};
  }

  &:disabled {
    background-color: ${({ unstyled }) => (unstyled ? "transparent" : "white")};
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string | ReactElement;
  EndIcon?: ReactElement;
  loading?: boolean;
  unstyled?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  text,
  EndIcon,
  loading = false,
  disabled = false,
  unstyled = false,
  ...props
}) => {
  return (
    <CustomButton
      disabled={disabled}
      backgroundColor={props?.style?.backgroundColor}
      unstyled={unstyled}
      {...props}
    >
      {loading ? <Loader size={24} /> : text}
      {!loading && EndIcon}
    </CustomButton>
  );
};

export default Button;
