import React, { useMemo } from 'react';
import { Provider } from 'react-redux';
import { store, persistor } from '../../roomStore';
import { ConfigUser, IConfig, MessageProps } from '../../types/types';
import '../../index.css';
import '../../helpers/storeConsole';
import LoginWrapper from './LoginWrapper.tsx';
import { PersistGate } from 'redux-persist/integration/react';
import Loader from '../styled/Loader.tsx';
import { ToastProvider } from '../../context/ToastContext.tsx';
import {
  AssistantChatButton,
  AssistantChatPopup,
} from '../styled/StyledComponents';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { AssistantChatWrapper } from './AssistantComponents.tsx/AssistantChatWrapper.tsx';
import {
  ETHO_ASSISTANT_MESSAGES,
  ETHO_ASSISTANT_USER,
} from '../../helpers/constants/ASSISTANT_LOCAL_STORAGE';
import { createAnonymousXmppCredentials } from '../../utils/createAnonymousXmppCredentials';

interface ChatWrapperProps {
  token?: string;
  roomJID?: string;
  user?: ConfigUser;
  loginData?: { email: string; password: string };
  MainComponentStyles?: React.CSSProperties;
  CustomMessageComponent?: React.ComponentType<MessageProps>;
  config?: IConfig;
}

export const ReduxWrapper: React.FC<ChatWrapperProps> = React.memo(
  ({ ...props }) => {
    const memoizedConfig = useMemo(() => {
      if (props.config?.assistantMode) {
        const user = window.localStorage.getItem(ETHO_ASSISTANT_USER);
        if (user) {
          props.config.assistantMode.user = JSON.parse(user);
        } else {
          const credentials = createAnonymousXmppCredentials();
          window.localStorage.setItem(
            ETHO_ASSISTANT_USER,
            JSON.stringify(credentials)
          );
          props.config.assistantMode.user = credentials;
        }
      }
      return props.config;
    }, [props.config]);

    // Assistant chat widget logic
    if (memoizedConfig?.assistantMode) {
      // LocalStorage key for open state
      const openStateKey =
        memoizedConfig.assistantOpenStateKey || 'assistantChatOpen';
      const { get, set } = useLocalStorage<boolean>(openStateKey);
      const [open, setOpen] = React.useState<boolean>(() => get() ?? false);

      React.useEffect(() => {
        set(open);
      }, [open]);

      // Button config
      const btnCfg = memoizedConfig.assistantButton || {};
      // Popup config
      const popupCfg = memoizedConfig.assistantPopup || {};

      return (
        <Provider store={store}>
          <ToastProvider>
            {!open && (
              <AssistantChatButton
                position={btnCfg.position}
                customStyle={btnCfg.style}
                aria-label={btnCfg.ariaLabel || 'Open chat'}
                onClick={() => setOpen(true)}
              >
                {btnCfg.icon || <span>💬</span>}
              </AssistantChatButton>
            )}
            {open && (
              <AssistantChatPopup
                width={popupCfg.width || 300}
                height={popupCfg.height || 600}
                customStyle={popupCfg.style}
                style={btnCfg.position}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: '1px solid #eee',
                    background: '#1976d2',
                    color: '#fff',
                  }}
                >
                  <span>{memoizedConfig.chatLabel || 'Assistant Chat'}</span>
                  <button
                    onClick={() => setOpen(false)}
                    aria-label={popupCfg.closeButtonAriaLabel || 'Close chat'}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#fff',
                      fontSize: 20,
                      cursor: 'pointer',
                    }}
                  >
                    {/* <CloseIcon /> */}×
                  </button>
                </div>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <AssistantChatWrapper
                    config={memoizedConfig}
                    roomJID={props.roomJID}
                  />
                </div>
              </AssistantChatPopup>
            )}
          </ToastProvider>
        </Provider>
      );
    }

    // Default: render as usual
    return (
      <Provider store={store}>
        <PersistGate loading={<Loader />} persistor={persistor}>
          <ToastProvider>
            <LoginWrapper config={memoizedConfig} {...props} />
          </ToastProvider>
        </PersistGate>
      </Provider>
    );
  }
);
