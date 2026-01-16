import React, { useMemo } from 'react';
import { Provider } from 'react-redux';
import { store, persistor } from '../../roomStore';
import { ConfigUser, IConfig } from '../../types/types';
import '../../index.css';
import '../../helpers/storeConsole';
import LoginWrapper from './LoginWrapper.tsx';
import { PersistGate } from 'redux-persist/integration/react';
import Loader from '../styled/Loader.tsx';
import { ToastProvider } from '../../context/ToastContext.tsx';
import { CustomComponentsProvider } from '../../context/CustomComponentsContext';
import { CustomComponentsContextValue } from '../../types/models/customComponents.model';
import { MessageNotificationProvider } from '../../context/MessageNotificationContext';
import { useMessageNotifications } from '../../hooks/useMessageNotifications';

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

// Internal component that uses the hook (needs to be inside Redux Provider)
const NotificationEnabler: React.FC = () => {
  useMessageNotifications();
  return null;
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
      return props.config;
    }, [props.config]);

    return (
      <Provider store={store}>
        <PersistGate loading={<Loader />} persistor={persistor}>
          <ToastProvider>
            <MessageNotificationProvider config={memoizedConfig}>
              <NotificationEnabler />
              <CustomComponentsProvider
                CustomMessageComponent={CustomMessageComponent}
                CustomInputComponent={CustomInputComponent}
                CustomScrollableArea={CustomScrollableArea}
                CustomDaySeparator={CustomDaySeparator}
                CustomNewMessageLabel={CustomNewMessageLabel}
              >
                <LoginWrapper config={memoizedConfig} {...props} />
              </CustomComponentsProvider>
            </MessageNotificationProvider>
          </ToastProvider>
        </PersistGate>
      </Provider>
    );
  }
);
