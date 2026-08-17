import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
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
import { ethoraLogger } from './helpers/ethoraLogger';

const LIVEKIT_URL =
  (((import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {})
    .VITE_LIVEKIT_URL || 'https://livekit.ethora-qa.com';

const APP_CHAT_BASE_CONFIG: IConfig = {
  appId: '699eff12e33de11c071f8696',
  baseUrl: 'https://api.ethoratest.com',
  xmppSettings: {
    devServer: 'wss://xmpp.ethoratest.com/ws',
    host: 'xmpp.ethoratest.com',
    conference: 'conference.xmpp.ethoratest.com',
    xmppPingOnSendEnabled: true,
  },
  userLogin: {
    enabled: true,
    user: null,
  },
  refreshTokens: { enabled: true },
  setRoomJidInPath: true,
  initBeforeLoad: true,
  videoCalls: {
    enabled: true,
    livekitUrl: LIVEKIT_URL,
    allowedRoomTypes: ['private'],
    enableAudioCalls: true,
  },
};

const Apps = () => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { hasUnread, totalCount, displayTotal, unreadByRoom, displayByRoom } =
    useUnreadMessagesCounter();

  // Notifications themselves are provided by the root <XmppProvider> (see
  // App() below) - it persists across routes, unlike <Chat>. No local
  // <Provider>/<MessageNotificationProvider> needed here anymore.
  return (
    <div>
      <NotificationEnabler />
      <div className="mb-3 p-3 rounded bg-white border border-gray-200 text-xs">
        <div className="font-semibold mb-2">Unread Counter Demo (outside chat)</div>
        <div>hasUnread: {hasUnread ? 'true' : 'false'}</div>
        <div>totalCount: {totalCount}</div>
        <div>displayTotal: {displayTotal}</div>
        <div className="mt-2 font-medium">By room:</div>
        {Object.keys(unreadByRoom).length === 0 ? (
          <div className="text-gray-500">No unread rooms</div>
        ) : (
          <div className="max-h-48 overflow-auto space-y-1 mt-1">
            {Object.entries(unreadByRoom).map(([jid, count]) => (
              <div
                key={jid}
                className="p-1 rounded bg-gray-50 border border-gray-100"
              >
                <div className="truncate" title={jid}>
                  {jid}
                </div>
                <div>
                  unread: {count} | display: {displayByRoom[jid] ?? String(count)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
            baseUrl: 'https://api.ethoratest.com',
            inAppNotifications: {
              enabled: true,
            },
          }}
        />
      )}
    </div>
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
      ...APP_CHAT_BASE_CONFIG,
      colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
      chatRoomStyles: { borderRadius: '16px' },
      roomListStyles: { borderRadius: '16px' },
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
      pushNotifications: {
        enabled: true,
        softAsk: false,
      },
      useStoreConsoleEnabled: true,
      translates: {
        enabled: true,
        // 'manual' (LinkedIn-style "Translate" link, click to reveal) so it
        // can be tested by hand instead of auto-showing. Switch to 'auto'
        // to have translations appear inline automatically.
        mode: 'manual',
      },
      i18n: {
        // locale intentionally left unset: useT() falls back to the same
        // langSource the globe-icon picker writes to when
        // config.i18n.locale isn't set, so picking a language in the
        // header changes static captions (Cancel/Add/Create/...) AND
        // message translations together, as one switch. Set locale here
        // explicitly if you want the host app to own UI language instead.
        strings: {
          // Uncomment to try a host override of a built-in caption:
          // 'action.send': 'Go!',
        },
      },
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
    <div style={{ height: 'calc(100svh - 20px)', overflow: 'hidden' }}>
      <ReduxWrapper
        // CustomMessageComponent={CustomMessageBubble}
        // CustomInputComponent={CustomChatInput}
        // CustomScrollableArea={CustomScrollableArea}
        // CustomDaySeparator={CustomDaySeparator}
        // roomJID="646cc8dc96d4a4dc8f7b2f2d_6824685682d635dba7522423@conference.xmpp.chat-qa.ethora.com"
        // roomJID="6998429ba125477a74a7dcef_69b96235545b8217d39dc1ac@conference.xmpp-dev.preshent.com"
        config={{
          // ...(demoJwtToken
          //   ? {
          //       jwtLogin: {
          //         enabled: true,
          //         token: demoJwtToken,
          //       },
          //     }
          //   : {}),
          customAppToken: 'JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImRpc3BsYXlOYW1lIjoiRXRob3JhLVZpdGFsbC1ZVC1UZXN0IiwiZG9tYWluTmFtZSI6ImFwcCIsImFwcFNlY3JldCI6ImY2MDZmNTFmN2FhODFlZTRhN2M3NGJlNWJjNDM4MDA3ZGMxM2U3NDFiYWNkYzAxZmYwOGY1YjJjMTMwN2Q2OTgiLCJjcmVhdG9ySWQiOiI2OTllZmYxMWUzM2RlMTFjMDcxZjg2OGIiLCJidW5kbGVJZCI6ImNvbS5ldGhvcmEiLCJwcmltYXJ5Q29sb3IiOiIjMDAzRTlDIiwiY29pblN5bWJvbCI6IkVUTyIsImNvaW5OYW1lIjoiRXRob3JhIENvaW4iLCJkZWZhdWx0QWNjZXNzUHJvZmlsZU9wZW4iOnRydWUsImRlZmF1bHRBY2Nlc3NBc3NldHNPcGVuIjp0cnVlLCJ1c2Vyc0NhbkZyZWUiOnRydWUsInBhcmVudEFwcElkIjpudWxsLCJpc0FsbG93ZWROZXdBcHBDcmVhdGUiOnRydWUsImlzQmFzZUFwcCI6dHJ1ZSwiZmlyZWJhc2VXZWJDb25maWdTdHJpbmciOiJ7XCJhcGlLZXlcIjpcIkFJemFTeURRZGt2dnhLS3g0LVdyakxRb1lmMDhHRkFSZ2lfcU80Z1wiLFwiYXV0aERvbWFpblwiOlwiZXRob3JhLTY2OGU5LmZpcmViYXNlYXBwLmNvbVwiLFwicHJvamVjdElkXCI6XCJldGhvcmEtNjY4ZTlcIixcInN0b3JhZ2VCdWNrZXRcIjpcImV0aG9yYS02NjhlOS5hcHBzcG90LmNvbVwiLFwibWVzc2FnaW5nU2VuZGVySWRcIjpcIjk3MjkzMzQ3MDA1NFwiLFwiYXBwSWRcIjpcIjE6OTcyOTMzNDcwMDU0OndlYjpkNDY4MmU3NmVmMDJmZDliOWNkYWE3XCIsXCJtZWFzdXJlbWVudElkXCI6XCJHLVdITTdYUlo0QzhcIn0iLCJnb29nbGVTZXJ2aWNlc0pzb24iOiIiLCJnb29nbGVTZXJ2aWNlSW5mb1BsaXN0IjoiIiwiUkVBQ1RfQVBQX1NUUklQRV9QVUJMSVNIQUJMRV9LRVkiOiIiLCJSRUFDVF9BUFBfU1RSSVBFX1NFQ1JFVF9LRVkiOiIiLCJzeXN0ZW1DaGF0QWNjb3VudCI6eyJqaWQiOiJhcHBfNjk5ZWZmMTJlMzNkZTExYzA3MWY4Njk1IiwicGFzc3dvcmQiOiJuMnlwRVF1NTU3In0sInNpZ25vbk9wdGlvbnMiOlsiZW1haWwiLCJnb29nbGUiLCJmYWNlYm9vayJdLCJhZnRlckxvZ2luUGFnZSI6ImNoYXRzIiwiYXZhaWxhYmxlTWVudUl0ZW1zIjp7ImNoYXRzIjp0cnVlLCJwcm9maWxlIjp0cnVlLCJzZXR0aW5ncyI6dHJ1ZX0sImFsbG93VXNlcnNUb0NyZWF0ZVJvb21zIjp0cnVlLCJhaUJvdCI6eyJ0cmlnZ2VyIjoiYW55X21lc3NhZ2UiLCJwcm9tcHQiOiJZb3UgYXJlIGEgaGVscGZ1bCBhc3Npc3RhbnQuIiwiaXNSQUciOnRydWUsInRvdGFsU2l0ZVNvdXJjZVNpemUiOjB9LCJfaWQiOiI2OTllZmYxMmUzM2RlMTFjMDcxZjg2OTYiLCJhcHBUb2tlbnMiOltdLCJkZWZhdWx0Um9vbXMiOltdfSwiaWF0IjoxNzcyMDI3NjY2fQ.bOHDP9_Q5ty3G3C3DOxtfRypmvxx1ebvsQUKGuiTnx0',
          setRoomJidInPath: true,
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
              ethoraLogger.log('✅ Message sent successfully:', event.message);
            },
          },
          ...config,
          inAppNotifications: {
            enabled: true,
            showInContext: true, // Show notifications in chat component
            position: {
              horizontal: 'left',
              vertical: 'bottom',
              offset: {
                left: 20,
                bottom: 20,
              },
            },
          }
          // pushNotifications: {
          //   enabled: true,
          //   softAsk: false,
          // },
        }}
        MainComponentStyles={mainStyles}
      />
    </div>
  );
});

ChatComponent.displayName = 'ChatComponent';

export default function App() {
  const { totalCount, displayTotal } = useUnreadMessagesCounter();

  const globalXmppConfig = useMemo(
    () => APP_CHAT_BASE_CONFIG,
    []
  );

  // Gives the root-level notification provider (see <XmppProvider> below)
  // something to work with on routes that haven't mounted <Chat> yet (e.g.
  // /apps before "Toggle Chat") - <Chat>'s own config still wins once it
  // dispatches setConfig (see MessageNotificationContext's config priority).
  const rootNotificationConfig: IConfig = useMemo(
    () => ({ inAppNotifications: { enabled: true } }),
    []
  );

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
                {displayTotal}
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
    [totalCount, displayTotal]
  );

  return (
    <XmppProvider config={rootNotificationConfig}>
    {/* <XmppProvider config={globalXmppConfig}> */}
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
