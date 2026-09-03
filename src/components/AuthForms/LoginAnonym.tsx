import React from 'react';
import styled from 'styled-components';
import { MessageInput } from '../styled/StyledComponents';
import Button from '../styled/Button';
import { IConfig } from '../../types/types';
import { useToast } from '../../context/ToastContext';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import { useT } from '../../i18n/useT';

interface LoginFormProps {
  config?: IConfig;
}

const LoginForm: React.FC<LoginFormProps> = ({ config }) => {
  const { showToast } = useToast();
  const t = useT();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    showToast({
      id: 'success',
      title: t('toast.loginSuccessfulTitle'),
      message: t('auth.anonymousLoginMessage'),
      type: 'success',
    });
    ethoraLogger.log('Form submitted');
  };

  return (
    <FormContainer>
      <Card>
        <Button
          type="submit"
          variant="filled"
          onClick={(e) => handleSubmit(e)}
          text={t('auth.loginAnonymously')}
          style={{
            width: '100%',
            height: '44px',
            borderRadius: 'var(--ethora-radius-sm, 8px)',
            backgroundColor: config?.colors?.primary || '#0052CD',
            color: 'white',
          }}
        />
        <Delimiter>{t('auth.anonymousTextOnly')}</Delimiter>
      </Card>
    </FormContainer>
  );
};

// Matches Login.tsx's card-on-tinted-background layout (see FormContainer/
// Form there) so the two entry points read as one consistent auth flow.
const FormContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background-color: var(--ethora-color-bg-subtle, #f5f7fa);
`;

const Card = styled.div`
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
