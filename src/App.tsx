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
import { Iso639_1Codes } from './types/models/language.model';
import { store } from './roomStore';
import { setLangSource } from './roomStore/chatSettingsSlice';

// Demo-only: which language the reader sees translated messages in, and
// which language the sender declares themselves writing in when a message
// is pre-translated on send (see sendTextMessageWithTranslateTagStanza) -
// one selector drives both, matching how a single person actually uses it
// ("I read and write in Português"). Kept in localStorage only, per
// product decision - no server-side persistence.
const TRANSLATE_LANG_STORAGE_KEY = 'ethora-translate-lang';
const TRANSLATE_LANGUAGES: { code: Iso639_1Codes; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'zh', label: '中文' },
];
const DEFAULT_TRANSLATE_LANG: Iso639_1Codes = 'en';

const readStoredTranslateLang = (): Iso639_1Codes => {
  if (typeof window === 'undefined') return DEFAULT_TRANSLATE_LANG;
  const stored = window.localStorage.getItem(TRANSLATE_LANG_STORAGE_KEY);
  return (TRANSLATE_LANGUAGES.find((l) => l.code === stored)?.code ||
    DEFAULT_TRANSLATE_LANG) as Iso639_1Codes;
};

const useTranslateLanguage = () => {
  const [translateLang, setTranslateLangState] = useState<Iso639_1Codes>(
    readStoredTranslateLang
  );

  // Keep Redux's langSource (the source-language declared on outgoing
  // messages) in sync too - useSendMessage.tsx reads it from there, not
  // from config, so the dropdown needs to reach it via the store directly
  // (this runs above <XmppProvider>'s own <Provider>, so no useDispatch here).
  useEffect(() => {
    store.dispatch(setLangSource(translateLang));
  }, [translateLang]);

  const setTranslateLang = (code: Iso639_1Codes) => {
    setTranslateLangState(code);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TRANSLATE_LANG_STORAGE_KEY, code);
    }
  };

  return { translateLang, setTranslateLang };
};

const TranslateLanguagePicker: React.FC<{
  value: Iso639_1Codes;
  onChange: (code: Iso639_1Codes) => void;
}> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const current = TRANSLATE_LANGUAGES.find((l) => l.code === value) || TRANSLATE_LANGUAGES[0];

  return (
    <div style={{ position: 'relative', marginBottom: 8 }}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid #d1d5db',
          background: '#fff',
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        {current.label}
        <span style={{ marginLeft: 'auto' }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 20,
            overflow: 'hidden',
          }}
        >
          {TRANSLATE_LANGUAGES.map((lang) => (
            <div
              key={lang.code}
              onClick={() => {
                onChange(lang.code);
                setIsOpen(false);
              }}
              style={{
                padding: '8px 12px',
                fontSize: 14,
                cursor: 'pointer',
                background: lang.code === value ? '#eef2ff' : 'transparent',
              }}
            >
              {lang.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const LIVEKIT_URL =
  (((import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {})
    .VITE_LIVEKIT_URL || 'https://livekit.ethora-qa.com';

const APP_CHAT_BASE_CONFIG: IConfig = {
  appId: '646cc8dc96d4a4dc8f7b2f2d',
  baseUrl: 'https://api.chat-qa.ethora.com/v1',
  xmppSettings: {
    devServer: 'wss://xmpp.chat-qa.ethora.com/ws',
    host: 'xmpp.chat-qa.ethora.com',
    conference: 'conference.xmpp.chat-qa.ethora.com',
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
            baseUrl: 'https://api.chat-qa.ethora.com/v1',
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

const ChatComponent = React.memo(({ translateLang }: { translateLang: Iso639_1Codes }) => {
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
        mode: 'auto',
        targets: TRANSLATE_LANGUAGES.map((l) => l.code),
        readerLocale: translateLang,
      },
    }),
    [translateLang]
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
          customAppToken: 'JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlzVXNlckRhdGFFbmNyeXB0ZWQiOmZhbHNlLCJwYXJlbnRBcHBJZCI6bnVsbCwiaXNBbGxvd2VkTmV3QXBwQ3JlYXRlIjp0cnVlLCJpc0Jhc2VBcHAiOnRydWUsIl9pZCI6IjY0NmNjOGRjOTZkNGE0ZGM4ZjdiMmYyZCIsImRpc3BsYXlOYW1lIjoiRXRob3JhIiwiZG9tYWluTmFtZSI6ImV0aG9yYSIsImNyZWF0b3JJZCI6IjY0NmNjOGQzOTZkNGE0ZGM4ZjdiMmYyNSIsInVzZXJzQ2FuRnJlZSI6dHJ1ZSwiZGVmYXVsdEFjY2Vzc0Fzc2V0c09wZW4iOnRydWUsImRlZmF1bHRBY2Nlc3NQcm9maWxlT3BlbiI6dHJ1ZSwiYnVuZGxlSWQiOiJjb20uZXRob3JhIiwicHJpbWFyeUNvbG9yIjoiIzAwM0U5QyIsInNlY29uZGFyeUNvbG9yIjoiIzI3NzVFQSIsImNvaW5TeW1ib2wiOiJFVE8iLCJjb2luTmFtZSI6IkV0aG9yYSBDb2luIiwiUkVBQ1RfQVBQX0ZJUkVCQVNFX0FQSV9LRVkiOiJBSXphU3lEUWRrdnZ4S0t4NC1XcmpMUW9ZZjA4R0ZBUmdpX3FPNGciLCJSRUFDVF9BUFBfRklSRUJBU0VfQVVUSF9ET01BSU4iOiJldGhvcmEtNjY4ZTkuZmlyZWJhc2VhcHAuY29tIiwiUkVBQ1RfQVBQX0ZJUkVCQVNFX1BST0pFQ1RfSUQiOiJldGhvcmEtNjY4ZTkiLCJSRUFDVF9BUFBfRklSRUJBU0VfU1RPUkFHRV9CVUNLRVQiOiJldGhvcmEtNjY4ZTkuYXBwc3BvdC5jb20iLCJSRUFDVF9BUFBfRklSRUJBU0VfTUVTU0FHSU5HX1NFTkRFUl9JRCI6Ijk3MjkzMzQ3MDA1NCIsIlJFQUNUX0FQUF9GSVJFQkFTRV9BUFBfSUQiOiIxOjk3MjkzMzQ3MDA1NDp3ZWI6ZDQ2ODJlNzZlZjAyZmQ5YjljZGFhNyIsIlJFQUNUX0FQUF9GSVJFQkFTRV9NRUFTVVJNRU5UX0lEIjoiRy1XSE03WFJaNEM4IiwiUkVBQ1RfQVBQX1NUUklQRV9QVUJMSVNIQUJMRV9LRVkiOiIiLCJSRUFDVF9BUFBfU1RSSVBFX1NFQ1JFVF9LRVkiOiIiLCJjcmVhdGVkQXQiOiIyMDIzLTA1LTIzVDE0OjA4OjI4LjEzNloiLCJ1cGRhdGVkQXQiOiIyMDIzLTA1LTIzVDE0OjA4OjI4LjEzNloiLCJfX3YiOjB9LCJpYXQiOjE2ODQ4NTA5MjV9.-IqNVMsf8GyS9Z-_yuNW7hpSmejajjAy-W0J8TadRIM',
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
  const { translateLang, setTranslateLang } = useTranslateLanguage();

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
        <TranslateLanguagePicker value={translateLang} onChange={setTranslateLang} />
      </nav>
    ),
    [totalCount, displayTotal, translateLang, setTranslateLang]
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
              <Route
                path="/chat"
                element={<ChatComponent translateLang={translateLang} />}
              />
            </Routes>
          </div>
        </div>
      </Router>
    </XmppProvider>
  );
}
