import React, { useCallback, useEffect, useState } from 'react';
import { IConfig, User } from '../../types/types';
import { ChatWrapper } from './ChatWrapper';
import LoginForm from '../AuthForms/Login';
import { RootState } from '../../roomStore';
import { useDispatch, useSelector } from 'react-redux';
import { setUser } from '../../roomStore/chatSettingsSlice';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import {
  loginEmail,
  loginViaJwt,
} from '../../networking/api-requests/auth.api';
import { StyledLoaderWrapper } from '../styled/StyledComponents';
import { setBaseURL } from '../../networking/apiClient';
import Loader from '../styled/Loader';
import ErrorFallback from './ErrorFallback';

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
    try {
      const authData = await loginEmail(
        props?.user?.email || 'yukiraze9@gmail.com',
        props?.user?.password || 'Qwerty123'
      );

      return {
        ...authData.data.user,
        token: authData.data.token,
        refreshToken: authData.data.refreshToken,
      };
    } catch (error) {
      console.error('Login failed:', error);
      return null;
    }
  }, []);

  const dispatch = useDispatch();

  useEffect(() => {
    if (config?.baseUrl) {
      setBaseURL(config?.baseUrl, config?.customAppToken);
    }
    if (props?.config?.userLogin?.enabled && props?.config?.userLogin?.user) {
      dispatch(setUser(config.userLogin.user));
      return;
    }

    //use localStorage, to check for user was already logged

    const storedUser: User = useLocalStorage(
      '@ethora/chat-component-user'
    ).get() as User;
    if (storedUser) {
      dispatch(setUser(storedUser));
    }

    //if jwt send api req with jwt and get user data

    if (config?.jwtLogin?.enabled) {
      const jwtLogin = async () => {
        try {
          const loginData = await loginViaJwt(config.jwtLogin.token);
          if (loginData) {
            dispatch(setUser(loginData));
          }
        } catch (error) {
          console.log('error with jwt login', error);
          setShowModal(true);
          console.log('Error, no user');
        }
      };
      jwtLogin();
    }

    //if no login config - default user login

    if (
      !config?.googleLogin &&
      !config?.defaultLogin &&
      !config?.jwtLogin &&
      !config?.userLogin &&
      user.xmppUsername === ''
    ) {
      const defaultLogin = async () => {
        try {
          const loginData = await loginUserFunction();
          if (loginData) {
            dispatch(setUser(loginData));
          }
        } catch (error) {
          console.log('error with default login', error);
          setShowModal(true);
        }
      };
      defaultLogin();
    }
    //if google - show login.tsx and process user there (there will be dispatch, set user)
    //if only ethora - show login with only ethora
    return () => {
      //clear
    };
  }, []);

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
