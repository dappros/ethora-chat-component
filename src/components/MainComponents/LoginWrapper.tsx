import React, { useCallback, useEffect, useState } from 'react';
import { IConfig, User } from '../../types/types';
import { ChatWrapper } from './ChatWrapper';
import LoginForm from '../AuthForms/Login';
import { RootState } from '../../roomStore';
import { useDispatch, useSelector } from 'react-redux';
import { setUser } from '../../roomStore/chatSettingsSlice';
import {
  ensureUserFromMy,
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
import { ethoraLogger } from '../../helpers/ethoraLogger';

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

      if (config?.customLogin?.enabled && config?.customLogin?.loginFunction) {
        try {
          const loginData = await config.customLogin.loginFunction();
          const normalizedUser = await ensureUserFromMy(loginData);
          if (!cancelled && normalizedUser) {
            dispatch(setUser(normalizedUser));
          } else if (!cancelled) {
            setShowModal(true);
          }
        } catch (error) {
          ethoraLogger.log('error with custom login', error);
          if (!cancelled) {
            setShowModal(true);
          }
        }
        return;
      }

      if (config?.userLogin?.enabled && config.userLogin.user) {
        const normalizedUser = await ensureUserFromMy(config.userLogin.user);
        if (!cancelled && normalizedUser) {
          dispatch(setUser(normalizedUser));
        }
        return;
      }

      const storedUser = getStoredUser(config?.appId) as User | null;
      if (storedUser && hasStoredSensitiveSession(storedUser)) {
        const normalizedUser = await ensureUserFromMy(storedUser);
        if (!cancelled && normalizedUser) {
          dispatch(setUser(normalizedUser));
        }
        return;
      }

      if (config?.jwtLogin?.enabled && config.jwtLogin.token) {
        try {
          const loginData = await loginViaJwt(config.jwtLogin.token);
          if (!cancelled && loginData) {
            const normalizedUser = await ensureUserFromMy(loginData);
            if (normalizedUser) {
              dispatch(setUser(normalizedUser));
            }
          }
        } catch (error) {
          ethoraLogger.log('error with jwt login', error);
          if (!cancelled) {
            setShowModal(true);
          }
          ethoraLogger.log('Error, no user');
        }
        return;
      }

      const hasExplicitLoginMode =
        !!config?.googleLogin ||
        !!config?.defaultLogin ||
        !!config?.customLogin ||
        !!config?.jwtLogin ||
        !!config?.userLogin;

      if (user.xmppUsername === '' && (!hasExplicitLoginMode || config?.defaultLogin)) {
        try {
          const loginData = await loginUserFunction();
          if (!cancelled && loginData) {
            const normalizedUser = await ensureUserFromMy(loginData);
            if (normalizedUser) {
              dispatch(setUser(normalizedUser));
            }
          }
        } catch (error) {
          ethoraLogger.log('error with default login', error);
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
