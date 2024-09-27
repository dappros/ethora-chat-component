import React, { ReactElement, ReactNode } from "react";
import styled from "styled-components";
import Loader from "./Loader";

// Styled button inheriting from the HTML button
const CustomButton = styled.button<{ disabled: boolean }>`
  border: none;
  border-radius: 8px;
  background-size: contain;
  cursor: pointer;
  height: 40px;
  width: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
`;

// Extend props from the default button attributes
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text?: string | ReactElement;
  EndIcon?: ReactElement;
  loading?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  text,
  EndIcon,
  loading = false,
  disabled = false,
  ...props // Spread operator to pass any additional props to the button
}) => {
  return (
    <CustomButton disabled={disabled} {...props}>
      {loading ? <Loader /> : text}
      {!loading && EndIcon}
    </CustomButton>
  );
};

export default Button;
