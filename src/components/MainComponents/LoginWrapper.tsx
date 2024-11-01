import React, { useCallback, useEffect } from 'react';
import { IConfig, MessageProps, User } from '../../types/types';
import { ChatWrapper } from './ChatWrapper';
import LoginForm from '../AuthForms/Login';
import { RootState } from '../../roomStore';
import { useDispatch, useSelector } from 'react-redux';
import { setUser } from '../../roomStore/chatSettingsSlice';
import { loginEmail, loginViaJwt } from '../../networking/apiClient';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { localStorageConstants } from '../../helpers/constants/LOCAL_STORAGE';

interface LoginWrapperProps {
  user?: { email: string; password: string };
  MainComponentStyles?: React.CSSProperties;
  CustomMessageComponent?: React.ComponentType<MessageProps>;
  config?: IConfig;
  roomJID?: string;
}

const LoginWrapper: React.FC<LoginWrapperProps> = ({ ...props }) => {
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
    //use localStorage, to check for user was already logged

    const storedUser: User = useLocalStorage(
      '@ethora/chat-component-user'
    ).get() as User;
    if (storedUser) {
      console.log('Login data storedUser', storedUser);
      dispatch(setUser(storedUser));
    }

    //if no login config - default user login

    if (
      !props.config?.googleLogin &&
      !props.config?.defaultLogin &&
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
        }
      };
      defaultLogin();
    }

    //if jwt send api req with jwt and get user data

    if (props.config?.jwtLogin?.enabled) {
      const jwtLogin = async () => {
        try {
          const loginData = await loginViaJwt(props.config?.jwtLogin?.token);
          if (loginData) {
            dispatch(setUser(loginData));
          }
        } catch (error) {
          console.log('error with default login', error);
        }
      };
      jwtLogin();
    }

    //if google - show login.tsx and process user there (there will be dispatch, set user)
    //if only ethora - show login with only ethora
    return () => {
      //clear
    };
  }, []);

  return (
    <>
      {user && user.xmppPassword !== '' ? (
        <ChatWrapper {...props} />
      ) : (
        <LoginForm {...props} />
      )}
    </>
  );
};

export default LoginWrapper;
