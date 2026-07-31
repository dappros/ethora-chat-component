import React, { useMemo } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { store, persistor } from '../../roomStore';
import { setConfig } from '../../roomStore/chatSettingsSlice';
import { ConfigUser, IConfig } from '../../types/types';
import '../../index.css';
import '../../helpers/storeConsole';
import LoginWrapper from './LoginWrapper.tsx';
import { PersistGate } from 'redux-persist/integration/react';
import Loader from '../styled/Loader.tsx';
import { ToastProvider } from '../../context/ToastContext.tsx';
import { CustomComponentsProvider } from '../../context/CustomComponentsContext';
import { CustomComponentsContextValue } from '../../types/models/customComponents.model';
import { useInAppNotifications } from '../../hooks/useInAppNotifications';
import usePushNotifications from '../../hooks/usePushNotifications';
import NotificationPermissionBanner from '../Notification/NotificationPermissionBanner';
import { useTypography } from '../../hooks/useTypography';
import { applyThemeColors } from '../../helpers/resolveIconColor';

interface ChatWrapperProps
  extends Pick<
    CustomComponentsContextValue,
    | 'CustomMessageComponent'
    | 'CustomInputComponent'
    | 'CustomScrollableArea'
    | 'CustomDaySeparator'
    | 'CustomNewMessageLabel'
  > {
  token?: string;
  roomJID?: string;
  user?: ConfigUser;
  loginData?: { email: string; password: string };
  MainComponentStyles?: React.CSSProperties;
  config?: IConfig;
}

const NotificationEnabler: React.FC = () => {
  useInAppNotifications();
  return null;
};

const TypographyEnabler: React.FC<{ config?: IConfig }> = ({ config }) => {
  useTypography(config?.typography);
  return null;
};

// Publish the host's config into the redux store as early as the chat mounts,
// rather than waiting for <ChatWrapper>.
//
// Two different things read "the config" and they used to disagree:
//   - applyThemeColors (below) reads the PROP, so CSS-variable theming was
//     live from the first paint;
//   - every component that calls resolveIconColor/resolveIconBgColor via
//     useChatSettingState (NoMessagesPlaceholder, ChatRoom, SendInput,
//     AudioRecorder, ...) reads the STORE.
//
// The store was only ever populated by useChatWrapperInit, which lives inside
// <ChatWrapper> - and LoginWrapper refuses to mount that until there's a
// logged-in user with xmpp credentials. Until then the store still held the
// slice's built-in default (`colors.primary: '#0052CD'`, Ethora's own brand
// blue), so those components rendered Ethora colours instead of the host's:
// briefly on a slow connect, and PERMANENTLY whenever login or the XMPP
// connection never completes - exactly the "empty chat placeholder and icons
// use Ethora's default colours" report.
//
// Dispatching here fixes both, and is safe: `config` is blacklisted from
// persistence, so nothing rehydrates over it, and useChatWrapperInit's own
// dispatch stays as-is (same value, and it still owns the cache-scope purge).
// Skipped when the host passes no config at all, so the slice default (which
// components dereference unguarded) is never replaced by undefined.
const ConfigEnabler: React.FC<{ config?: IConfig }> = ({ config }) => {
  const dispatch = useDispatch();
  React.useEffect(() => {
    if (!config) return;
    dispatch(setConfig(config));
  }, [config, dispatch]);
  return null;
};

const ThemeColorsEnabler: React.FC<{ config?: IConfig }> = ({ config }) => {
  React.useEffect(() => {
    applyThemeColors(config);
  }, [
    config?.colors?.icons,
    config?.colors?.primary,
    config?.colors?.ownMessageBackground,
    config?.colors?.otherMessageBackground,
    config?.colors?.inputBackground,
    config?.backgroundChat?.color,
    config?.backgroundChat?.image,
  ]);
  return null;
};

const PushNotificationsEnabler: React.FC<{ config?: IConfig }> = ({ config }) => {
  const { requestPermission } = usePushNotifications({
    enabled: config?.pushNotifications?.enabled,
    vapidPublicKey: config?.pushNotifications?.vapidPublicKey,
    firebaseConfig: config?.pushNotifications?.firebaseConfig,
    serviceWorkerPath: config?.pushNotifications?.serviceWorkerPath,
    serviceWorkerScope: config?.pushNotifications?.serviceWorkerScope,
    softAsk: config?.pushNotifications?.softAsk,
    onClick: config?.pushNotifications?.onClick,
  });
  return (
    <NotificationPermissionBanner
      config={config}
      requestPermission={requestPermission}
    />
  );
};

export const ReduxWrapper: React.FC<ChatWrapperProps> = React.memo(
  ({
    CustomMessageComponent,
    CustomInputComponent,
    CustomScrollableArea,
    CustomDaySeparator,
    CustomNewMessageLabel,
    ...props
  }) => {
    const memoizedConfig = useMemo(() => {
      if (!props.config) return props.config;

      return {
        ...props.config,
        newArch: props.config.newArch ?? true,
      };
    }, [props.config]);

    return (
      <Provider store={store}>
        <PersistGate loading={<Loader />} persistor={persistor}>
          <ToastProvider>
            <NotificationEnabler />
            <ConfigEnabler config={memoizedConfig} />
            <TypographyEnabler config={memoizedConfig} />
            <ThemeColorsEnabler config={memoizedConfig} />
            <PushNotificationsEnabler config={memoizedConfig} />
            <CustomComponentsProvider
              CustomMessageComponent={CustomMessageComponent}
              CustomInputComponent={CustomInputComponent}
              CustomScrollableArea={CustomScrollableArea}
              CustomDaySeparator={CustomDaySeparator}
              CustomNewMessageLabel={CustomNewMessageLabel}
            >
              {/* `config` must come AFTER the spread: props still carries the
                  raw config, so spreading last silently overwrote
                  memoizedConfig and threw away its `newArch ?? true`
                  default (and would now throw away the same normalization
                  ConfigEnabler puts in the store, leaving prop and store
                  disagreeing again). */}
              <LoginWrapper {...props} config={memoizedConfig} />
            </CustomComponentsProvider>
          </ToastProvider>
        </PersistGate>
      </Provider>
    );
  }
);
