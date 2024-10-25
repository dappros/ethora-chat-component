import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { MessageInput } from '../styled/StyledComponents';
import Button from '../styled/Button';
import { GoogleIcon } from '../../assets/icons';
import { IConfig } from '../../types/types';

interface LoginFormProps {
  config?: IConfig;
}

const LoginForm: React.FC<LoginFormProps> = ({ config }) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted');
  };

  return (
    <FormContainer>
      <Button
        type="submit"
        onClick={(e) => handleSubmit(e)}
        text={'Login anonymously'}
        style={{ width: '100%', height: '40px' }}
      />

      <Delimiter>Only could send text messages</Delimiter>
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

const Delimiter = styled.div`
  text-align: center;
  position: relative;
  width: 100%;
  font-size: 14px;
  color: #999;

  &::before,
  &::after {
    content: '';
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
