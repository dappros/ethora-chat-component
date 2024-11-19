import React, { useCallback, useEffect, useState } from 'react';
import { IConfig, MessageProps, User } from '../../types/types';
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
import { Overlay, StyledModal } from '../styled/MediaModal';

interface LoginWrapperProps {
  user?: { email: string; password: string };
  MainComponentStyles?: React.CSSProperties;
  CustomMessageComponent?: React.ComponentType<MessageProps>;
  config?: IConfig;
  roomJID?: string;
}

const LoginWrapper: React.FC<LoginWrapperProps> = ({ ...props }) => {
  const [showModal, setShowModal] = useState(false);

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

    //if jwt send api req with jwt and get user data

    if (props.config?.jwtLogin?.enabled) {
      const jwtLogin = async () => {
        try {
          const loginData = await loginViaJwt(props.config.jwtLogin.token);
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
        <Overlay>
          <StyledModal>Error on login.Try again</StyledModal>
        </Overlay>
      ) : user && user.xmppPassword !== '' ? (
        <ChatWrapper {...props} />
      ) : (
        <LoginForm {...props} />
      )}
    </>
  );
};

export default LoginWrapper;
