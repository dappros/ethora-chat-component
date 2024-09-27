import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { MessageInput } from "../styled/StyledComponents";
import Button from "../styled/Button";
import { GoogleIcon } from "../../assets/icons";
import { IConfig } from "../../types/types";

interface LoginFormProps {
  config?: IConfig;
}

const LoginForm: React.FC<LoginFormProps> = ({ config }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({ email: "", password: "" });

  useEffect(() => {
    validateForm();
  }, [email, password]);

  const validateForm = () => {
    let emailError = "";
    let passwordError = "";

    // Basic email validation
    if (!/\S+@\S+\.\S+/.test(email)) {
      emailError = "Invalid email format";
    }

    // Basic password validation
    if (password.length < 6) {
      passwordError = "Password must be at least 6 characters long";
    }

    setErrors({ email: emailError, password: passwordError });
  };

  const handleGoogleLogin = (e: { preventDefault: () => void }) => {
    e.preventDefault();
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    validateForm();
    if (!errors.email && !errors.password) {
      // Submit form logic
      console.log("Form submitted");
    }
  };

  return (
    <FormContainer>
      <Form onSubmit={handleSubmit}>
        <div
          style={{
            height: 40,
            width: "100%",
            display: "flex",
            gap: "4px",
            flexDirection: "column",
          }}
        >
          <MessageInput
            type="email"
            value={email}
            placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
            style={{
              border: `1px solid ${
                config ? config.colors?.primary : "#3498db"
              }`,
            }}
          />
          {errors.email && <ErrorMessage>{errors.email}</ErrorMessage>}
        </div>

        <div
          style={{
            height: 40,
            width: "100%",
            display: "flex",
            gap: "4px",
            flexDirection: "column",
          }}
        >
          <MessageInput
            type="password"
            value={password}
            placeholder="Password"
            onChange={(e) => setPassword(e.target.value)}
            style={{
              border: `1px solid ${
                config ? config.colors?.primary : "#3498db"
              }`,
            }}
          />
          {errors.password && <ErrorMessage>{errors.password}</ErrorMessage>}
        </div>

        <Button
          type="submit"
          text={"Login to Ethora Chat"}
          style={{ width: "100%", height: "40px" }}
        />

        <Delimiter>or</Delimiter>

        <Button
          onClick={handleGoogleLogin}
          style={{ width: "100%", height: "40px" }}
          text={<>Login with Google</>}
          EndIcon={<GoogleIcon style={{ height: "24px" }} />}
        />

        <div>
          Don't have an account?{" "}
          <div
            style={{
              textDecoration: "underline",
              color: "#0052CD",
              fontSize: "14px",
              display: "inline",
              cursor: "pointer",
              fontWeight: "400",
            }}
            onClick={() =>
              window.open("https://ethora.ethoradev.com/register", "_blank")
            }
          >
            Sign Up to Ethora
          </div>
        </div>
      </Form>
    </FormContainer>
  );
};

// Styled Components
const FormContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background-color: #f5f5f5;
  padding: 16px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: white;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.1);
  width: 300px;
  gap: 16px;
`;
const ErrorMessage = styled.span`
  color: red;
  font-size: 12px;
  margin-bottom: 10px;
`;

const Delimiter = styled.div`
  text-align: center;
  position: relative;
  width: 100%;
  font-size: 14px;
  color: #999;

  &::before,
  &::after {
    content: "";
    position: absolute;
    top: 50%;
    width: 45%;
    height: 1px;
    background: #ccc;
  }

  &::before {
    left: 0;
  }

  &::after {
    right: 0;
  }
`;

export default LoginForm;
