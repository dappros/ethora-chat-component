import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ReduxWrapper } from './components/MainComponents/ReduxWrapper';
import { XmppProvider } from './context/xmppProvider';
import { useUnreadMessagesCounter } from './hooks/useUnreadMessagesCounter';
import { IConfig } from './types/types';
import { logoutService, handleQRChatId } from './main';
import { handleCopyClick } from './helpers/handleCopyClick';

const Apps = () => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setIsChatOpen(!isChatOpen)}>Toggle Chat</button>
      {isChatOpen && (
        <ReduxWrapper
          config={{
            baseUrl: 'https://api.ethoradev.com/v1',
          }}
        />
      )}
    </div>
  );
};

const ChatComponent = React.memo(() => {
  const config: IConfig = useMemo(
    () => ({
      colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
      userLogin: { enabled: true, user: null },
      chatRoomStyles: { borderRadius: '16px' },
      roomListStyles: { borderRadius: '16px' },
      setRoomJidInPath: true,
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
    handleQRChatId();
    return () => {};
  }, [window.location.pathname]);

  return (
    <div style={{ height: 'calc(100vh - 20px)', overflow: 'hidden' }}>
      <ReduxWrapper
        roomJID="646cc8dc96d4a4dc8f7b2f2d_6824685682d635dba752242s3@conference.xmpp.ethoradev.com"
        config={{
          xmppSettings: {
            devServer: 'wss://xmpp.ethoradev.com:5443/ws',
            host: 'xmpp.ethoradev.com',
            conference: 'conference.xmpp.ethoradev.com',
          },
          baseUrl: 'https://api.ethoradev.com/v1',
          newArch: true,
          setRoomJidInPath: true,
          qrUrl: 'https://beta.ethora.com/app/chat/?qrChatId=',
          enableRoomsRetry: {
            enabled: true,
            helperText:
              'We couldn’t connect to chat server, please, try to create new source.',
          },
          // secondarySendButton: {
          //   enabled: true,
          //   messageEdit: `videoId:${window.location.href}`,
          //   buttonText: 'With Id',
          //   buttonStyles: {
          //     whiteSpace: 'nowrap',
          //     width: '60px',
          //   },
          // },
          ...config,
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
