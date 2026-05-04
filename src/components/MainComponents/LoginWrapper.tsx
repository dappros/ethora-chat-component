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

      // Short-circuit ONLY when the current redux user already matches what
      // config asks for (or config doesn't ask for anything specific).
      // The previous "any user wins" behavior broke multi-tenant scenarios
      // like the Ethora App Switcher: when an admin switches from base-app
      // to a child-app context, the parent component remounts the chat
      // tree with a new userLogin.user (the per-app gateway user), but
      // the redux store still holds the previous user from the previous
      // context. Without this check we'd skip the dispatch and the
      // chat-component would keep using the old user's JID against the
      // new app's rooms, which mod_ethora rejects with "wrong app name"
      // (because the JID prefix doesn't match the room JID prefix).
      const wantedUsername = config?.userLogin?.user?.xmppUsername || '';
      if (
        user.xmppUsername &&
        (!wantedUsername || user.xmppUsername === wantedUsername)
      ) {
        return;
      }

      if (config?.customLogin?.enabled && config?.customLogin?.loginFunction) {
        try {
          const loginData = await config.customLogin.loginFunction();
          if (!cancelled && loginData) {
            dispatch(setUser(loginData));
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
            dispatch(setUser(loginData));
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
      ) : user &&
        user.xmppPassword !== '' &&
        // When config asks for a specific user (multi-tenant App
        // Switcher use case), wait for the redux user to match before
        // mounting ChatWrapper. Without this gate, ChatWrapper would
        // render once with the previous user, useChatWrapperInit would
        // fire with stale credentials, XmppClient would SASL-bind as
        // the wrong JID, and by the time the useEffect above dispatches
        // the new user the connection is already wedged.
        (!config?.userLogin?.user?.xmppUsername ||
          user.xmppUsername === config.userLogin.user.xmppUsername) ? (
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
