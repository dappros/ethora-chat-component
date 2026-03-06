import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './roomStore';
import { ReduxWrapper } from './components/MainComponents/ReduxWrapper';
import { XmppProvider } from './context/xmppProvider';
import { useUnreadMessagesCounter } from './hooks/useUnreadMessagesCounter';
import { IConfig } from './types/types';
import { logoutService, handleQRChatId, useInAppNotifications } from './main';
import { handleCopyClick } from './helpers/handleCopyClick';
import CustomChatInput from './examples/customComponents/CustomChatInput';
import CustomScrollableArea from './examples/customComponents/CustomScrollableArea';
import CustomDaySeparator from './examples/customComponents/CustomDaySeparator';
import CustomMessageBubble from './examples/customComponents/CustomMessageBubble';
import { MessageNotificationProvider } from './context/MessageNotificationContext';

const Apps = () => {
  const [isChatOpen, setIsChatOpen] = useState(false);

  const appsNotificationConfig: IConfig = useMemo(
    () => ({
      inAppNotifications: {
        enabled: true,
        showInContext: true,
        position: {
          horizontal: 'left',
          vertical: 'bottom',
          offset: {
            left: 20,
            bottom: 20,
          },
        },
      },
    }),
    []
  );

  return (
    <Provider store={store}>
      <MessageNotificationProvider config={appsNotificationConfig}>
        <NotificationEnabler />
        <div>
          <button onClick={() => setIsChatOpen(!isChatOpen)}>
            Toggle Chat
          </button>
          {isChatOpen && (
            <ReduxWrapper
              CustomMessageComponent={CustomMessageBubble}
              CustomInputComponent={CustomChatInput}
              CustomScrollableArea={CustomScrollableArea}
              CustomDaySeparator={CustomDaySeparator}
              config={{
                baseUrl: 'https://api.ethoradev.com/v1',
                inAppNotifications: {
                  enabled: true,
                  showInContext: true, // Show in chat component context as well
                },
              }}
            />
          )}
        </div>
      </MessageNotificationProvider>
    </Provider>
  );
};

// Component to enable notifications (needs Redux)
const NotificationEnabler: React.FC = () => {
  useInAppNotifications();
  return null;
};

const ChatComponent = React.memo(() => {
  const config: IConfig = useMemo(
    () => ({
      appId: '66f5edf81b762117e1bfa26a', //default app id
      colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
      userLogin: {
        enabled: true,
        user: null,
      },
      chatRoomStyles: { borderRadius: '16px' },
      roomListStyles: { borderRadius: '16px' },
      setRoomJidInPath: true,
      // inAppNotifications: {
      //   enabled: true,
      //   showInContext: true,
      //   position: {
      //     horizontal: 'left',
      //     vertical: 'bottom',
      //     offset: {
      //       left: 20,
      //       bottom: 20,
      //     },
      //   },
      // },
      pushNotifications: {
        enabled: true,
        vapidPublicKey:
          'BIZdmCnHiDRMrBBRzW79Dm1i7hMFRQM9CS1QfbalxjNwY-yvLtkj3IuZQaZ0ChZtjzlRSowkXUCmJC_jVgbFqew',
        softAsk: false,
      },
      useStoreConsoleEnabled: true,
    }),
    []
  );

  const mainStyles = useMemo(
    () => ({
      width: '100%',
      height: '100%',
      borderRadius: '16px',
      border: '1px solid #E4E4E7',
      overflow: 'hidden',
    }),
    []
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      handleQRChatId();
    }
    return () => {};
  }, []); // Remove window.location.pathname from dependencies

  // If you need to react to pathname changes, use a separate effect:
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handlePathChange = () => {
        handleQRChatId();
      };
      window.addEventListener('popstate', handlePathChange);
      return () => window.removeEventListener('popstate', handlePathChange);
    }
  }, []);

  return (
    <div style={{ height: 'calc(100vh - 20px)', overflow: 'hidden' }}>
      <ReduxWrapper
        // CustomMessageComponent={CustomMessageBubble}
        // CustomInputComponent={CustomChatInput}
        // CustomScrollableArea={CustomScrollableArea}
        // CustomDaySeparator={CustomDaySeparator}
        // roomJID="646cc8dc96d4a4dc8f7b2f2d_6824685682d635dba7522423@conference.xmpp.ethoradev.com"
        config={{
          xmppSettings: {
            devServer: 'wss://xmpp.ethoradev.com:5443/ws',
            host: 'xmpp.ethoradev.com',
            conference: 'conference.xmpp.ethoradev.com',
            xmppPingOnSendEnabled: true,
          },
          baseUrl: 'https://api.ethoradev.com/v1',
          newArch: true,
          setRoomJidInPath: true,
          qrUrl: 'https://beta.ethora.com/app/chat/?qrChatId=',
          refreshTokens: { enabled: true },
          // secondarySendButton: {
          //   enabled: true,
          //   messageEdit: 'asdasd',
          //   label: <div>'Send'</div>,
          //   buttonStyles: {
          //     whiteSpace: 'nowrap',
          //     width: '60px',
          //   },
          //   hideInputSendButton: true,
          //   overwriteEnterClick: true,
          // },
          disableMedia: true,
          eventHandlers: {
            onMessageSent: async (event) => {
              console.log('✅ Message sent successfully:', event.message);
            },
          },
          ...config,
          // inAppNotifications: {
          //   enabled: true,
          //   showInContext: true, // Show notifications in chat component
          //   position: {
          //     horizontal: 'left',
          //     vertical: 'bottom',
          //     offset: {
          //       left: 20,
          //       bottom: 20,
          //     },
          //   },
          // },
          pushNotifications: {
            enabled: true,
            vapidPublicKey:
              'BIZdmCnHiDRMrBBRzW79Dm1i7hMFRQM9CS1QfbalxjNwY-yvLtkj3IuZQaZ0ChZtjzlRSowkXUCmJC_jVgbFqew',
            softAsk: false,
          },
        }}
        MainComponentStyles={mainStyles}
      />
    </div>
  );
});

ChatComponent.displayName = 'ChatComponent';

export default function App() {
  const { totalCount } = useUnreadMessagesCounter();
  const handleLogoutClick = () => {
    logoutService.performLogout();
  };

  const navigation = useMemo(
    () => (
      <nav className="flex flex-col space-y-2 p-4 bg-gray-100 h-screen">
        <Link to="/apps">
          <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 relative">
            Apps
            {totalCount > 0 && (
              <div className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full px-2">
                {totalCount}
              </div>
            )}
          </button>
        </Link>
        <Link to="/chat">
          <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            Chat
          </button>
        </Link>
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          onClick={() => handleLogoutClick()}
        >
          Logout
        </button>
      </nav>
    ),
    [totalCount]
  );

  return (
    <XmppProvider>
      <Router>
        <div className="flex">
          {navigation}
          <div className="flex-1 p-4">
            <Routes>
              <Route path="/apps" element={<Apps />} />
              <Route path="/chat" element={<ChatComponent />} />
            </Routes>
          </div>
        </div>
      </Router>
    </XmppProvider>
  );
}
