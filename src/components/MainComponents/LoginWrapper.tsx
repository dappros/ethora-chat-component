import React, { useCallback, useEffect, useState } from 'react';
import { IConfig, User } from '../../types/types';
import { ChatWrapper } from './ChatWrapper';
import LoginForm from '../AuthForms/Login';
import { RootState } from '../../roomStore';
import { useDispatch, useSelector } from 'react-redux';
import { setUser } from '../../roomStore/chatSettingsSlice';
import {
  loginEmail,
  loginViaJwt,
} from '../../networking/api-requests/auth.api';
import { StyledLoaderWrapper } from '../styled/StyledComponents';
import { setBaseURL } from '../../networking/apiClient';
import Loader from '../styled/Loader';
import ErrorFallback from './ErrorFallback';
import {
  getStoredUser,
  hasStoredSensitiveSession,
} from '../../helpers/authStorage';

import { CustomComponentsContextValue } from '../../types/models/customComponents.model';

interface LoginWrapperProps
  extends Partial<
    Pick<
      CustomComponentsContextValue,
      | 'CustomMessageComponent'
      | 'CustomInputComponent'
      | 'CustomScrollableArea'
      | 'CustomDaySeparator'
    >
  > {
  user?: { email: string; password: string };
  MainComponentStyles?: React.CSSProperties;
  config?: IConfig;
  roomJID?: string;
}

const LoginWrapper: React.FC<LoginWrapperProps> = ({ ...props }) => {
  const [showModal, setShowModal] = useState(false);
  const { config, MainComponentStyles } = props;

  const { user } = useSelector((state: RootState) => state.chatSettingStore);

  const loginUserFunction = useCallback(async () => {
    if (!props?.user?.email || !props?.user?.password) {
      return null;
    }

    try {
      const authData = await loginEmail(props.user.email, props.user.password);

      return {
        ...authData.data.user,
        token: authData.data.token,
        refreshToken: authData.data.refreshToken,
      };
    } catch (error) {
      console.error('Login failed:', error);
      return null;
    }
  }, [props?.user?.email, props?.user?.password]);

  const dispatch = useDispatch();

  useEffect(() => {
    let cancelled = false;

    const initUser = async () => {
      if (config?.baseUrl) {
        setBaseURL(config.baseUrl, config.customAppToken);
      }

      if (user.xmppUsername) {
        return;
      }

      if (config?.userLogin?.enabled && config.userLogin.user) {
        dispatch(setUser(config.userLogin.user));
        return;
      }

      const storedUser = getStoredUser(config?.appId) as User | null;
      if (storedUser && hasStoredSensitiveSession(storedUser)) {
        dispatch(setUser(storedUser));
        return;
      }

      if (config?.jwtLogin?.enabled && config.jwtLogin.token) {
        try {
          const loginData = await loginViaJwt(config.jwtLogin.token);
          if (!cancelled && loginData) {
            dispatch(setUser(loginData));
          }
        } catch (error) {
          console.log('error with jwt login', error);
          if (!cancelled) {
            setShowModal(true);
          }
          console.log('Error, no user');
        }
        return;
      }

      if (config?.defaultLogin && user.xmppUsername === '') {
        try {
          const loginData = await loginUserFunction();
          if (!cancelled && loginData) {
            dispatch(setUser(loginData));
          }
        } catch (error) {
          console.log('error with default login', error);
          if (!cancelled) {
            setShowModal(true);
          }
        }
      }
    };

    void initUser();

    return () => {
      cancelled = true;
    };
  }, [config, dispatch, loginUserFunction, user.xmppUsername]);

  return (
    <>
      {showModal ? (
        <ErrorFallback
          MainComponentStyles={MainComponentStyles}
          onButtonClick={() => setShowModal(false)}
        />
      ) : user && user.xmppPassword !== '' ? (
        <ChatWrapper {...props} />
      ) : config?.jwtLogin?.enabled ? (
        <StyledLoaderWrapper
          style={{ alignItems: 'center', flexDirection: 'column', gap: '10px' }}
        >
          <Loader color={config?.colors?.primary} style={{ margin: '0px' }} />
        </StyledLoaderWrapper>
      ) : (
        <LoginForm {...props} />
      )}
    </>
  );
};

export default LoginWrapper;
