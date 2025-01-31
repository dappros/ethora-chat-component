import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { MessageInput } from '../styled/StyledComponents';
import Button from '../styled/Button';
import { GoogleIcon } from '../../assets/icons';
import { IConfig } from '../../types/types';
import {
  checkEmailExist,
  loginEmail,
  loginSocial,
  registerSocial,
  signInWithGoogle,
} from '../../networking/api-requests/auth.api';
import { useDispatch } from 'react-redux';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { setUser } from '../../roomStore/chatSettingsSlice';
import { localStorageConstants } from '../../helpers/constants/LOCAL_STORAGE';

interface LoginFormProps {
  config?: IConfig;
}

const LoginForm: React.FC<LoginFormProps> = ({ config }) => {
  const dispatch = useDispatch();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '' });

  const validateForm = () => {
    let emailError = '';
    let passwordError = '';

    if (!/\S+@\S+\.\S+/.test(email)) {
      emailError = 'Invalid email format';
    }

    if (password.length < 6) {
      passwordError = 'Password must be at least 6 characters long';
    }

    return { emailError, passwordError };
  };

  const handleRegularLogin = useCallback(async () => {
    setIsLoading(true);
    try {
      const authData = await loginEmail(email, password);

      if (authData?.status === 401) {
        setErrors((prev) => ({
          ...prev,
          password: 'You entered wrong data. Try again',
        }));
        setIsLoading(false);
        return null;
      }

      const user = {
        ...authData.data.user,
        token: authData.data.token,
        refreshToken: authData.data.refreshToken,
      };
      dispatch(setUser(user));
      useLocalStorage(localStorageConstants.ETHORA_USER).set(user);
    } catch (error) {
      console.error('Login failed:', error);
      setIsLoading(false);

      return null;
    }
    setIsLoading(false);
  }, [email, password, dispatch]);

  const handleGoogleLogin = async (e: { preventDefault: () => void }) => {
    setIsLoading(true);

    e.preventDefault();
    const loginType = 'google';

    try {
      const res = await signInWithGoogle();

      const emailExist = await checkEmailExist(
        res.user?.providerData[0].email || ''
      );

      if (!emailExist.data.success) {
        try {
          await registerSocial(
            res.idToken || '',
            res.credential?.accessToken || '',
            '',
            loginType
          );
          const loginRes = await loginSocial(
            res.idToken || '',
            res.credential?.accessToken || '',
            loginType
          );
          console.log('google log after register res', loginRes);

          const user = {
            ...loginRes.data.user,
            token: loginRes.data.token,
            refreshToken: loginRes.data.refreshToken,
          };
          dispatch(setUser(user));
          useLocalStorage(localStorageConstants.ETHORA_USER).set(user);
        } catch (error) {
          console.log('error registering user viag google');
        }
      }
      if (res.idToken && res.credential && res.credential.accessToken) {
        const loginRes = await loginSocial(
          res.idToken,
          res.credential.accessToken,
          loginType
        );
        console.log('google log res', loginRes);
        const user = {
          ...loginRes.data.user,
          token: loginRes.data.token,
          refreshToken: loginRes.data.refreshToken,
        };
        dispatch(setUser(user));
        useLocalStorage(localStorageConstants.ETHORA_USER).set(user);
      }
    } catch (error) {
      console.log(error);
    }
    setIsLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { emailError, passwordError } = validateForm();

    setErrors({ email: emailError, password: passwordError });

    if (!emailError && !passwordError) {
      handleRegularLogin();
    }
  };

  return (
    <FormContainer>
      <Form onSubmit={handleSubmit}>
        <div
          style={{
            height: 40,
            width: '100%',
            display: 'flex',
            gap: '4px',
            flexDirection: 'column',
          }}
        >
          <MessageInput
            type="email"
            value={email}
            placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
            style={{
              border: `1px solid ${
                config ? config.colors?.primary : '#3498db'
              }`,
            }}
          />
          {errors.email && <ErrorMessage>{errors.email}</ErrorMessage>}
        </div>

        <div
          style={{
            height: 40,
            width: '100%',
            display: 'flex',
            gap: '4px',
            flexDirection: 'column',
          }}
        >
          <MessageInput
            type="password"
            value={password}
            placeholder="Password"
            onChange={(e) => setPassword(e.target.value)}
            style={{
              border: `1px solid ${
                config ? config.colors?.primary : '#3498db'
              }`,
            }}
          />
          {errors.password && <ErrorMessage>{errors.password}</ErrorMessage>}
        </div>

        <Button
          type="submit"
          text={'Login to Ethora Chat'}
          style={{
            width: '100%',
            height: '40px',
            backgroundColor: config?.colors?.primary || '#0052CD',
            color: 'white',
          }}
          disabled={isLoading}
          loading={isLoading}
        />
        {config?.googleLogin?.enabled && (
          <>
            <Delimiter>or</Delimiter>
            <Button
              onClick={handleGoogleLogin}
              style={{ width: '100%', height: '40px' }}
              text={<>Login with Google</>}
              EndIcon={<GoogleIcon style={{ height: '24px' }} />}
              disabled={isLoading}
            />
          </>
        )}
        <div>
          Don't have an account?{' '}
          <div
            style={{
              textDecoration: 'underline',
              color: '#0052CD',
              fontSize: '14px',
              display: 'inline',
              cursor: 'pointer',
              fontWeight: '400',
            }}
            onClick={() =>
              window.open('https://ethora.ethoradev.com/register', '_blank')
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
