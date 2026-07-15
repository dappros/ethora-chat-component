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
import FallbackScreen from './FallbackScreen';
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

      // Short-circuit ONLY when the current redux user is actually USABLE
      // and matches what config asks for (or config doesn't ask for
      // anything specific).
      //
      // `xmppPassword` is the thing that makes a rehydrated user usable:
      // it's what LoginWrapper's own render gate below requires before it
      // will mount <ChatWrapper>, and what XmppClient needs to connect.
      // Checking it here (not just `xmppUsername`) is what makes a page
      // refresh restore the session instead of showing the login form:
      // scrubSensitiveChatStateTransform deliberately strips token /
      // xmppPassword out of persist:chatSettingStore (auth material must
      // not sit in localStorage), so after rehydrate redux holds a user
      // with a real xmppUsername but an EMPTY xmppPassword. The old
      // `user.xmppUsername && ...` guard treated that husk as "already
      // logged in" and returned early - so the restore paths below
      // (getStoredUser() -> the intact session in
      // @ethora/chat-component-user-session) never ran, and the render
      // gate then fell through to <LoginForm> because xmppPassword === ''.
      // Every refresh looked like a logout even though the stored session
      // was perfectly good.
      //
      // The multi-tenant guard this replaces is preserved: when config
      // asks for a specific user (Ethora App Switcher hopping between
      // app contexts), we still refuse to short-circuit unless the redux
      // user IS that user - otherwise we'd keep the previous context's
      // JID against the new app's rooms and mod_ethora would reject it
      // with "wrong app name".
      const wantedUsername = config?.userLogin?.user?.xmppUsername || '';
      const hasUsableSession = Boolean(user.xmppUsername && user.xmppPassword);
      if (
        hasUsableSession &&
        (!wantedUsername || user.xmppUsername === wantedUsername)
      ) {
        return;
      }

      if (config?.customLogin?.enabled && config?.customLogin?.loginFunction) {
        try {
          const loginData = await config.customLogin.loginFunction();
          // Took main's ensureUserFromMy(loginData) over tf-dev's direct
          // dispatch(loginData). Main's /my-endpoint normalization is exactly
          // the fix Roman mentioned for the "/user returning undefined ->
          // Deleted User" issue we discussed in Slack.
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
        const candidate = config.userLogin.user as User;
        const hasXmppCreds = Boolean(
          (candidate as any)?.xmppPassword &&
            ((candidate as any)?.xmppUsername ||
              (candidate as any)?.defaultWallet?.walletAddress)
        );
        const normalizedUser = hasXmppCreds
          ? candidate
          : await ensureUserFromMy(candidate);
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
    // `user.xmppPassword` belongs here alongside xmppUsername: the
    // short-circuit above now keys off BOTH (a rehydrated user has a
    // username but no password - see the comment there). Without the
    // password in deps, this effect wouldn't re-evaluate when a restore
    // path fills it in, and a genuinely-needed re-login could be skipped.
  }, [config, dispatch, loginUserFunction, user.xmppUsername, user.xmppPassword]);

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
      ) : config?.fallbackScreens?.noUser != null ? (
        // Host opted out of the built-in Ethora login screen (e.g. they drive
        // auth themselves and just logged the user out). This branch is the
        // one that actually renders on logout — ChatWrapper never mounts when
        // there's no user — so the noUser fallback must be honored here too.
        <FallbackScreen content={config.fallbackScreens.noUser} />
      ) : (
        <LoginForm {...props} />
      )}
    </>
  );
};

export default LoginWrapper;
