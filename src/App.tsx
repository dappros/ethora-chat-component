import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ReduxWrapper } from './components/MainComponents/ReduxWrapper';
import { IntoXmppProvider } from './context/IntoXmppProvider.tsx';
import { useUnreadMessagesCounter } from './hooks/useUnreadMessagesCounter';

const Apps = () => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setIsChatOpen(!isChatOpen)}>setIsChatOpen</button>
      {isChatOpen && (
        <ReduxWrapper
          config={{
            baseUrl: 'https://dev.api.platform.atomwcapps.com/v1',
          }}
        />
      )}
    </div>
  );
};

// Memoized chat component with configuration
const ChatComponent = React.memo(() => {
  const config = useMemo(
    () => ({
      colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
      userLogin: { enabled: true, user: null },
      chatRoomStyles: { borderRadius: '16px' },
      roomListStyles: { borderRadius: '16px' },
      setRoomJidInPath: true,
      baseUrl: 'https://dev.api.ethoradev.com/v1',
    }),
    []
  );

  const mainStyles = useMemo(
    () => ({
      width: '90%',
      height: '90%',
      borderRadius: '16px',
      border: '1px solid #E4E4E7',
      overflow: 'hidden',
    }),
    []
  );

  return (
    <div style={{ height: 'calc(100vh - 20px)', overflow: 'hidden' }}>
      <ReduxWrapper
        config={{
          xmppSettings: {
            devServer: 'wss://dev.xmpp.ethoradev.com:5443/ws',
            host: 'dev.xmpp.ethoradev.com',
            conference: 'conference.dev.xmpp.ethoradev.com',
          },
          baseUrl: 'https://dev.api.ethoradev.com/v1',
          newArch: true,
        }}
        MainComponentStyles={mainStyles}
      />
    </div>
  );
});

ChatComponent.displayName = 'ChatComponent';

// Main App component
export default function App() {
  const { totalCount, hasUnread, unreadByRoom } = useUnreadMessagesCounter();

  const navigation = useMemo(() => {
    return (
      <nav
        className="flex flex-col space-y-2 p-4 bg-gray-100 h-screen"
        style={{ display: 'flex', gap: '12px' }}
      >
        <Link to="/apps">
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            style={{ position: 'relative' }}
          >
            Apps
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                backgroundColor: 'red',
              }}
            >
              {totalCount}
            </div>
          </button>
        </Link>
        <Link to="/chat">
          <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            Chat
          </button>
        </Link>
      </nav>
    );
  }, [totalCount]);

  return (
    <IntoXmppProvider config={{
      xmppSettings: {
        devServer: 'wss://dev.xmpp.ethoradev.com:5443/ws',
        host: 'dev.xmpp.ethoradev.com',
        conference: 'conference.dev.xmpp.ethoradev.com',
      },
      baseUrl: 'https://dev.api.ethoradev.com/v1',
      newArch: true,
    }}>
      <Router>
        <div className="flex">
          {navigation}
          <div className="flex-1 p-4">
            <Routes>
              <Route path="/apps" element={<Apps />}></Route>
              <Route path="/chat" element={<ChatComponent />} />
            </Routes>
          </div>
        </div>
      </Router>
    </IntoXmppProvider>
  );
}
