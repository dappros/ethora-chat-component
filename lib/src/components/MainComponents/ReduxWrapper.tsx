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
