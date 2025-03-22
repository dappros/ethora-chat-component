import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { ReduxWrapper } from './components/MainComponents/ReduxWrapper';
import { XmppProvider } from './context/xmppProvider';
import { useUnreadMessagesCounter } from './hooks/useUnreadMessagesCounter';

const Apps = () => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setIsChatOpen(!isChatOpen)}>setIsChatOpen</button>
      {isChatOpen && (
        <ReduxWrapper
          config={{
            enableTranslates: true,
            // baseUrl: 'https://dev.api.platform.atomwcapps.com/v1',
            setRoomJidInPath: true,
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
      // disableHeader: true,
      colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
      // disableRooms: true,
      defaultLogin: true,
      // jwtLogin: {
      //   enabled: true,
      //   token:
      //     'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InR5cGUiOiJjbGllbnQiLCJ1c2VySWQiOiIwMTkzM2U3MS03MmVjLTdhZWUtODVjNS1hYWI5YzEwZTUzOWYiLCJhcHBJZCI6IjY3MDYzMzJkYjFiMWE0ZTk4NGQzYzdiYyJ9fQ.KPGe9ltYTgPZYYWYZEJNpP85QNdHAb3rlw82pIdIIeY',
      //   handleBadlogin: null,
      // },
      userLogin: { enabled: true, user: null },
      // disableInteractions: true,
      chatRoomStyles: { borderRadius: '16px' },
      roomListStyles: { borderRadius: '16px' },
      refreshTokens: { enabled: true },
      // defaultRooms: [
      //   {
      //     jid: '5f9a4603b2b5bbfa6b228b642127c56d03b778ad594c52b755e605c977303979@conference.xmpp.ethoradev.com',
      //     pinned: true,
      //     _id: '6672807fef55364c13703235',
      //   },
      //   {
      //     jid: '6c00199ef7fb86d09b10f70c353411c70fe7f75847cacdb322c813416bcc33ab@conference.xmpp.ethoradev.com',
      //     pinned: false,
      //     _id: '6672807fef55364c13703236',
      //   },
      //   {
      //     jid: 'd673a602b47d524ba6a95102cc71fc3f308b31d64454498078a056cf54e5a2b4@conference.xmpp.ethoradev.com',
      //     pinned: false,
      //     _id: '6672807fef55364c13703237',
      //   },
      // ],
      setRoomJidInPath: true,
      // enableTranslates: true,
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
          ...config,
          disableSentLogic: true,
        }}
        MainComponentStyles={mainStyles}
      />
    </div>
  );
});

ChatComponent.displayName = 'ChatComponent';

// Main App component
export default function App() {
  const { totalCount, hasUnread, unreadByRoom } = useUnreadMessagesCounter({});

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
    <XmppProvider
      config={{
        baseUrl: 'https://dev.api.platform.atomwcapps.com/v1',
        xmppSettings: {
          devServer: 'wss://dev.xmpp.platform.atomwcapps.com:5443/ws',
          host: 'dev.xmpp.platform.atomwcapps.com',
          conference: 'conference.dev.xmpp.platform.atomwcapps.com',
        },
        colors: {
          primary: '#4a75ba',
          secondary: '#141414',
        },
        userLogin: {
          enabled: true,
          user: {
            defaultWallet: {
              walletAddress: '0x6f19c705361c8729C50df22E5DDa53d7E1d50CCF',
            },
            _id: '67bdba487bef19b3dcfd2190',
            firstName: 'case',
            lastName: 'worker1',
            email: 'testcw1@mailinator.com',
            tags: [],
            appId: '67bdb2a6d4d518a62d2051d2',
            xmppPassword: 'yehieompqv',
            roles: [],
            isProfileOpen: true,
            isAssetsOpen: true,
            isAgreeWithTerms: true,
            homeScreen: '',
            emails: [
              {
                loginType: '',
                email: '',
                verified: true,
                _id: '',
              },
            ],
            updatedAt: '2025-03-10T01:10:29.736Z',
            __v: 0,
            authMethod: 'email',
            token:
              'JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJJZCI6IjY3YmRiYTQ4N2JlZjE5YjNkY2ZkMjE5MCIsImFwcElkIjoiNjdiZGIyYTZkNGQ1MThhNjJkMjA1MWQyIn0sImlhdCI6MTc0MTU2OTg5MywiZXhwIjoxNzQxNTc3MDkzfQ.V37NcfDiOX6pNBcRazaxZ4TEg4qzyOMebMe8U-g1y1U',
            refreshToken:
              'JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7InVzZXJJZCI6IjY3YmRiYTQ4N2JlZjE5YjNkY2ZkMjE5MCIsImFwcElkIjoiNjdiZGIyYTZkNGQ1MThhNjJkMjA1MWQyIn0sImlhdCI6MTc0MTU2OTg5MywiZXhwIjoxNzQyMTc0NjkzfQ.5kLSpzwfZwkta1ev1DLHszYhztvpqbaZGebjJGIrB8s',
            walletAddress: '0x6f19c705361c8729C50df22E5DDa53d7E1d50CCF',
          },
        },
        refreshTokens: {
          enabled: true,
        },
        enableTranslates: true,
        chatRoomStyles: {
          maxHeight: '800px',
          height: '500px',
          borderRadius: '0px 16px 16px 0px',
          border: 'none',
          color: '#141414',
        },
        chatHeaderBurgerMenu: false,
        disableRooms: true,
        disableHeader: true,
        initBeforeLoad: true,
      }}
    >
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
    </XmppProvider>
  );
}
