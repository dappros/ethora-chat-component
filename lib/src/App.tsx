import React, { useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ReduxWrapper } from './components/MainComponents/ReduxWrapper';

const Apps = () => <div>Apps</div>;

// Memoized chat component with configuration
const ChatComponent = React.memo(() => {
  const config = useMemo(
    () => ({
      colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
      defaultLogin: true,
      chatRoomStyles: { borderRadius: '16px' },
      roomListStyles: { borderRadius: '16px' },
      refreshTokens: { enabled: true },
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

  return (
    <div style={{ height: 'calc(100vh - 20px)', overflow: 'hidden' }}>
      <ReduxWrapper config={config} MainComponentStyles={mainStyles} />
    </div>
  );
});

ChatComponent.displayName = 'ChatComponent';

// Main App component
export default function App() {
  const navigation = useMemo(
    () => (
      <nav className="flex flex-col space-y-2 p-4 bg-gray-100 h-screen">
        <Link to="/apps">
          <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            Apps
          </button>
        </Link>
        <Link to="/chat">
          <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            Chat
          </button>
        </Link>
      </nav>
    ),
    []
  );

  return (
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
  );
}
