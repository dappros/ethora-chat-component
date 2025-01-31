import React, { useMemo } from 'react';
import { Provider } from 'react-redux';
import { store, persistor } from '../../roomStore';
import { ConfigUser, IConfig, MessageProps } from '../../types/types';
import { XmppProvider } from '../../context/xmppProvider.tsx';
import '../../index.css';
import '../../helpers/storeConsole';
import LoginWrapper from './LoginWrapper.tsx';
import { PersistGate } from 'redux-persist/integration/react';
import Loader from '../styled/Loader.tsx';

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
      return props.config;
    }, [props.config]);

    return (
      <XmppProvider>
        <Provider store={store}>
          <PersistGate loading={<Loader />} persistor={persistor}>
            <LoginWrapper config={memoizedConfig} {...props} />
          </PersistGate>
        </Provider>
      </XmppProvider>
    );
  }
);

// import React, { useMemo } from 'react';
// import { Provider } from 'react-redux';
// import { store } from '../../roomStore';
// import { ConfigUser, IConfig, MessageProps } from '../../types/types';
// import { XmppProvider } from '../../context/xmppProvider.tsx';
// import '../../index.css';
// import '../../helpers/storeConsole';
// import LoginWrapper from './LoginWrapper.tsx';

// interface ChatWrapperProps {
//   token?: string;
//   roomJID?: string;
//   user?: ConfigUser;
//   loginData?: { email: string; password: string };
//   MainComponentStyles?: React.CSSProperties;
//   CustomMessageComponent?: React.ComponentType<MessageProps>;
//   config?: IConfig;
// }

// export const ReduxWrapper: React.FC<ChatWrapperProps> = React.memo(
//   ({ ...props }) => {
//     const memoizedConfig = useMemo(() => {
//       return props.config;
//     }, [props.config]);

//     return (
//       <XmppProvider>
//         <Provider store={store}>
//           <LoginWrapper config={memoizedConfig} {...props} />
//         </Provider>
//       </XmppProvider>
//     );
//   }
// );
