import React, { useState, useCallback } from 'react';
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
import { setUser } from '../../roomStore/chatSettingsSlice';
import { useToast } from '../../context/ToastContext';
import { VITE_APP_WEB_URL } from '../../config';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import { useT } from '../../i18n/useT';

interface LoginFormProps {
  config?: IConfig;
}

const LoginForm: React.FC<LoginFormProps> = ({ config }) => {
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const t = useT();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '' });

  const validateForm = () => {
    let emailError = '';
    let passwordError = '';

    if (!/\S+@\S+\.\S+/.test(email)) {
      emailError = t('validation.invalidEmail');
    }

    if (password.length < 6) {
      passwordError = t('validation.passwordTooShort');
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
          password: t('validation.wrongCredentials'),
        }));
        setIsLoading(false);
        showToast({
          id: 'error',
          title: t('toast.loginFailedTitle'),
          message: t('toast.invalidCredentials'),
          type: 'error',
        });
        return null;
      }

      const user = {
        ...authData.data.user,
        token: authData.data.token,
        refreshToken: authData.data.refreshToken,
      };
      dispatch(setUser(user));
      showToast({
        id: 'success',
        title: t('toast.loginSuccessfulTitle'),
        message: t('toast.welcomeBack'),
        type: 'success',
      });
    } catch (error) {
      console.error('Login failed:', error);
      showToast({
        id: 'error',
        title: t('toast.loginErrorTitle'),
        message: t('toast.loginErrorMessage'),
        type: 'error',
      });
    }
    setIsLoading(false);
  }, [email, password, dispatch, showToast, t]);

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
          ethoraLogger.log('google log after register res', loginRes);

          const user = {
            ...loginRes.data.user,
            token: loginRes.data.token,
            refreshToken: loginRes.data.refreshToken,
          };
          dispatch(setUser(user));
        } catch (error) {
          ethoraLogger.log('error registering user viag google');
        }
      }
      if (res.idToken && res.credential && res.credential.accessToken) {
        const loginRes = await loginSocial(
          res.idToken,
          res.credential.accessToken,
          loginType
        );
        ethoraLogger.log('google log res', loginRes);
        const user = {
          ...loginRes.data.user,
          token: loginRes.data.token,
          refreshToken: loginRes.data.refreshToken,
        };
        dispatch(setUser(user));
      }
    } catch (error) {
      ethoraLogger.log(error);
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
        <FieldGroup>
          <FieldLabel htmlFor="ethora-login-email">
            {t('field.email')}
          </FieldLabel>
          <MessageInput
            id="ethora-login-email"
            type="email"
            value={email}
            placeholder={t('field.email')}
            autoComplete="email"
            data-testid="auth_email_input"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'ethora-login-email-error' : undefined}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              border: `1px solid ${
                errors.email
                  ? 'var(--ethora-color-danger, #D92D20)'
                  : `var(--ethora-color-border, #E6E8EC)`
              }`,
              borderRadius: 'var(--ethora-radius-sm, 8px)',
            }}
          />
          {errors.email && (
            <ErrorMessage id="ethora-login-email-error" data-testid="auth_email_error">
              {errors.email}
            </ErrorMessage>
          )}
        </FieldGroup>

        <FieldGroup>
          <FieldLabel htmlFor="ethora-login-password">
            {t('field.password')}
          </FieldLabel>
          <MessageInput
            id="ethora-login-password"
            type="password"
            value={password}
            placeholder={t('field.password')}
            autoComplete="current-password"
            data-testid="auth_password_input"
            aria-invalid={!!errors.password}
            aria-describedby={
              errors.password ? 'ethora-login-password-error' : undefined
            }
            onChange={(e) => setPassword(e.target.value)}
            style={{
              border: `1px solid ${
                errors.password
                  ? 'var(--ethora-color-danger, #D92D20)'
                  : `var(--ethora-color-border, #E6E8EC)`
              }`,
              borderRadius: 'var(--ethora-radius-sm, 8px)',
            }}
          />
          {errors.password && (
            <ErrorMessage id="ethora-login-password-error" data-testid="auth_password_error">
              {errors.password}
            </ErrorMessage>
          )}
        </FieldGroup>

        <Button
          type="submit"
          variant="filled"
          text={t('auth.loginButton')}
          data-testid="auth_submit_button"
          style={{
            width: '100%',
            height: '44px',
            borderRadius: 'var(--ethora-radius-sm, 8px)',
            backgroundColor: config?.colors?.primary || '#0052CD',
            color: 'white',
          }}
          disabled={isLoading}
          loading={isLoading}
        />
        {config?.googleLogin?.enabled && (
          <>
            <Delimiter>{t('auth.orDelimiter')}</Delimiter>
            <Button
              onClick={handleGoogleLogin}
              variant="outlined"
              style={{
                width: '100%',
                height: '44px',
                borderRadius: 'var(--ethora-radius-sm, 8px)',
              }}
              text={<>{t('auth.loginWithGoogle')}</>}
              EndIcon={<GoogleIcon style={{ height: '24px' }} />}
              disabled={isLoading}
            />
          </>
        )}
        <div>
          {t('auth.noAccount')}{' '}
          <div
            style={{
              textDecoration: 'underline',
              color: 'var(--ethora-color-primary-text, var(--ethora-color-primary, #0052CD))',
              fontSize: 'var(--ethora-font-size-sm, 14px)',
              display: 'inline',
              cursor: 'pointer',
              fontWeight: '400',
            }}
            onClick={() => {
              if (typeof window !== "undefined") {
                window.open(
                  VITE_APP_WEB_URL ? `${VITE_APP_WEB_URL}/register` : `${window.location.origin}/register`,
                  "_blank"
                );
              }
            }}
          >
            {t('auth.signUp')}
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
  background-color: var(--ethora-color-bg-subtle, #f5f7fa);
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background-color: var(--ethora-color-bg, #fff);
  padding: 32px;
  border-radius: var(--ethora-radius-lg, 16px);
  box-shadow: var(--ethora-shadow-md, 0 4px 12px rgba(16, 24, 40, 0.1));
  width: 320px;
  gap: 16px;
`;

const FieldGroup = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FieldLabel = styled.label`
  font-size: var(--ethora-font-size-xs, 12px);
  font-weight: 500;
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

const ErrorMessage = styled.span`
  color: var(--ethora-color-danger, #d92d20);
  font-size: var(--ethora-font-size-xs, 12px);
`;

const Delimiter = styled.div`
  text-align: center;
  position: relative;
  width: 100%;
  font-size: var(--ethora-font-size-sm, 14px);
  color: var(--ethora-color-text-muted, #8c8c8c);

  &::before,
  &::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 45%;
    height: 1px;
    background: var(--ethora-color-border, #e6e8ec);
  }

  &::before {
    left: 0;
  }

  &::after {
    right: 0;
  }
`;

export default LoginForm;
