import React from 'react';
import { Provider } from 'react-redux';
import { store } from '../../roomStore';
import { ConfigUser, IConfig, MessageProps } from '../../types/types';
import { XmppProvider } from '../../context/xmppProvider.tsx';
import '../../index.css';
import '../../helpers/storeConsole';
import LoginWrapper from './LoginWrapper.tsx';

interface ChatWrapperProps {
  token?: string;
  roomJID?: string;
  user?: ConfigUser;
  loginData?: { email: string; password: string };
  MainComponentStyles?: React.CSSProperties;
  CustomMessageComponent?: React.ComponentType<MessageProps>;
  config?: IConfig;
}

export const ReduxWrapper: React.FC<ChatWrapperProps> = ({ ...props }) => {
  return (
    <XmppProvider>
      <Provider store={store}>
        <LoginWrapper {...props} />
      </Provider>
    </XmppProvider>
  );
};
