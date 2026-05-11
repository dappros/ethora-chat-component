import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
// Use LOCAL source to verify the useChatWrapperInit fix.
// Original npm imports kept for reference:
// import { XmppProvider, Chat, useUnread } from 'ethora-chat-pkg';
import { XmppProvider } from './context/xmppProvider';
import { ReduxWrapper as Chat } from './components/MainComponents/ReduxWrapper';
import { useUnread } from './hooks/useUnreadMessagesCounter';

const APP_ID = '646cc8dc96d4a4dc8f7b2f2d';
const BASE_URL = 'https://api.chat.ethora.com/v1';
const CONFERENCE = 'conference.xmpp.chat.ethora.com';
const APP_TOKEN =
  'JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlzVXNlckRhdGFFbmNyeXB0ZWQiOmZhbHNlLCJwYXJlbnRBcHBJZCI6bnVsbCwiaXNBbGxvd2VkTmV3QXBwQ3JlYXRlIjp0cnVlLCJpc0Jhc2VBcHAiOnRydWUsIl9pZCI6IjY0NmNjOGRjOTZkNGE0ZGM4ZjdiMmYyZCIsImRpc3BsYXlOYW1lIjoiRXRob3JhIiwiZG9tYWluTmFtZSI6ImV0aG9yYSIsImNyZWF0b3JJZCI6IjY0NmNjOGQzOTZkNGE0ZGM4ZjdiMmYyNSIsInVzZXJzQ2FuRnJlZSI6dHJ1ZSwiZGVmYXVsdEFjY2Vzc0Fzc2V0c09wZW4iOnRydWUsImRlZmF1bHRBY2Nlc3NQcm9maWxlT3BlbiI6dHJ1ZSwiYnVuZGxlSWQiOiJjb20uZXRob3JhIiwicHJpbWFyeUNvbG9yIjoiIzAwM0U5QyIsInNlY29uZGFyeUNvbG9yIjoiIzI3NzVFQSIsImNvaW5TeW1ib2wiOiJFVE8iLCJjb2luTmFtZSI6IkV0aG9yYSBDb2luIiwiUkVBQ1RfQVBQX0ZJUkVCQVNFX0FQSV9LRVkiOiJBSXphU3lEUWRrdnZ4S0t4NC1XcmpMUW9ZZjA4R0ZBUmdpX3FPNGciLCJSRUFDVF9BUFBfRklSRUJBU0VfQVVUSF9ET01BSU4iOiJldGhvcmEtNjY4ZTkuZmlyZWJhc2VhcHAuY29tIiwiUkVBQ1RfQVBQX0ZJUkVCQVNFX1BST0pFQ1RfSUQiOiJldGhvcmEtNjY4ZTkiLCJSRUFDVF9BUFBfRklSRUJBU0VfU1RPUkFHRV9CVUNLRVQiOiJldGhvcmEtNjY4ZTkuYXBwc3BvdC5jb20iLCJSRUFDVF9BUFBfRklSRUJBU0VfTUVTU0FHSU5HX1NFTkRFUl9JRCI6Ijk3MjkzMzQ3MDA1NCIsIlJFQUNUX0FQUF9GSVJFQkFTRV9BUFBfSUQiOiIxOjk3MjkzMzQ3MDA1NDp3ZWI6ZDQ2ODJlNzZlZjAyZmQ5YjljZGFhNyIsIlJFQUNUX0FQUF9GSVJFQkFTRV9NRUFTVVJNRU5UX0lEIjoiRy1XSE03WFJaNEM4IiwiUkVBQ1RfQVBQX1NUUklQRV9QVUJMSVNIQUJMRV9LRVkiOiIiLCJSRUFDVF9BUFBfU1RSSVBFX1NFQ1JFVF9LRVkiOiIiLCJjcmVhdGVkQXQiOiIyMDIzLTA1LTIzVDE0OjA4OjI4LjEzNloiLCJ1cGRhdGVkQXQiOiIyMDIzLTA1LTIzVDE0OjA4OjI4LjEzNloiLCJfX3YiOjB9LCJpYXQiOjE2ODQ4NTA5MjV9.-IqNVMsf8GyS9Z-_yuNW7hpSmejajjAy-W0J8TadRIM';

const BASE_CONFIG = {
  appId: APP_ID,
  baseUrl: BASE_URL,
  customAppToken: APP_TOKEN,
  xmppSettings: {
    devServer: 'wss://xmpp.chat.ethora.com/ws',
    host: 'xmpp.chat.ethora.com',
    conference: CONFERENCE,
    xmppPingOnSendEnabled: true,
  },
  colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
  refreshTokens: { enabled: true },
  disableRooms: true,
} as const;

type AppUser = {
  token: string;
  refreshToken?: string;
  xmppUsername: string;
  xmppPassword: string;
  firstName?: string;
  email?: string;
  _id?: string;
};

type ApiRoomMember = { _id: string; firstName?: string; lastName?: string };
type ApiRoomItem = {
  _id: string;
  name: string;
  title?: string;
  type?: string;
  picture?: string;
  members?: ApiRoomMember[];
  createdAt?: string;
  updatedAt?: string;
};

type RoomTab = 'description' | 'other' | 'chat';

const ROOM_TABS: { id: RoomTab; label: string }[] = [
  { id: 'description', label: 'Description' },
  { id: 'other', label: 'Other stuff' },
  { id: 'chat', label: 'Chat' },
];

const PRIMARY = BASE_CONFIG.colors.primary;
const SECONDARY = BASE_CONFIG.colors.secondary;

const UnreadBadge: React.FC<{ value: string | number; muted?: boolean }> = ({
  value,
  muted,
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 20,
      height: 20,
      padding: '0 6px',
      borderRadius: 999,
      background: muted ? PRIMARY : '#E5484D',
      color: '#fff',
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1,
    }}
  >
    {value}
  </span>
);

const LoginScreen: React.FC<{ onLogin: (user: AppUser) => void }> = ({
  onLogin,
}) => {
  const [email, setEmail] = useState('dawepa1952@hutudns.com');
  const [password, setPassword] = useState('12345678');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await axios.post(
        `${BASE_URL}/users/login-with-email`,
        { email, password },
        { headers: { Authorization: APP_TOKEN } }
      );
      const data = res.data || {};
      const user: AppUser = {
        ...data.user,
        token: data.token,
        refreshToken: data.refreshToken,
      };
      if (!user.token) throw new Error('No token');
      onLogin(user);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'white',
          padding: 30,
          borderRadius: 8,
          boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
          width: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <strong>Test app — npm @ethora/chat-component@26.3.18</strong>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          style={{ padding: 10, border: `1px solid ${PRIMARY}`, borderRadius: 6 }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={{ padding: 10, border: `1px solid ${PRIMARY}`, borderRadius: 6 }}
        />
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: 10,
            background: PRIMARY,
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          {busy ? 'Logging in…' : 'Login'}
        </button>
        {error && <div style={{ color: '#E5484D', fontSize: 13 }}>{error}</div>}
      </form>
    </div>
  );
};

const apiRoomToMeta = (room: ApiRoomItem) => ({
  jid: `${room.name}@${CONFERENCE}`,
  title: room.title || room.name,
  membersCount: Array.isArray(room.members) ? room.members.length : 0,
  type: room.type,
  createdAt: room.createdAt,
});

type RoomMeta = ReturnType<typeof apiRoomToMeta>;

const HomeScreen: React.FC<{
  user: AppUser;
  onSelect: (jid: string) => void;
  selectedJid: string | null;
  onLogout: () => void;
  onRoomsLoaded: (rooms: RoomMeta[]) => void;
}> = ({ user, onSelect, selectedJid, onLogout, onRoomsLoaded }) => {
  const { hasUnread, displayTotal, unreadByRoom, displayByRoom } = useUnread();
  const [rooms, setRooms] = useState<RoomMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get<{ items: ApiRoomItem[] }>(
          `${BASE_URL}/chats/my`,
          { headers: { Authorization: user.token } }
        );
        if (cancelled) return;
        const list = (res.data?.items || []).map(apiRoomToMeta);
        setRooms(list);
        onRoomsLoaded(list);
      } catch (e) {
        if (!cancelled) setRooms([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.token]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #E4E4E7',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #E4E4E7',
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            Welcome{user.firstName ? `, ${user.firstName}` : ''} 👋
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 14,
              color: '#52525B',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            Unread messages
            <UnreadBadge value={hasUnread ? displayTotal : 0} muted={!hasUnread} />
          </div>
        </div>
        <button
          onClick={onLogout}
          style={{
            border: '1px solid #E4E4E7',
            background: 'white',
            borderRadius: 8,
            padding: '6px 12px',
            cursor: 'pointer',
          }}
        >
          Logout
        </button>
      </div>
      <div style={{ padding: '12px 20px 8px', fontSize: 13, color: '#71717A' }}>
        Your rooms
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {loading && rooms.length === 0 ? (
          <div style={{ padding: 20, color: '#71717A' }}>Loading…</div>
        ) : rooms.length === 0 ? (
          <div style={{ padding: 20, color: '#71717A' }}>No rooms.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rooms.map((r) => {
              const unread = unreadByRoom?.[r.jid] || 0;
              const isActive = selectedJid === r.jid;
              return (
                <li key={r.jid}>
                  <button
                    onClick={() => onSelect(r.jid)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '14px 20px',
                      border: 'none',
                      borderBottom: '1px solid #F1F1F4',
                      borderLeft: `3px solid ${isActive ? PRIMARY : 'transparent'}`,
                      background: isActive ? SECONDARY : 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: 15,
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.title}
                    </span>
                    {unread > 0 && (
                      <UnreadBadge value={displayByRoom?.[r.jid] ?? unread} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

const DescriptionTab: React.FC<{ meta?: RoomMeta }> = ({ meta }) => (
  <div style={{ padding: 24, fontSize: 14, color: '#27272A' }}>
    <h3 style={{ margin: '0 0 12px' }}>Description</h3>
    {!meta ? (
      <div>—</div>
    ) : (
      <div style={{ display: 'grid', gap: 6 }}>
        <div>
          <strong>Title:</strong> {meta.title}
        </div>
        <div style={{ wordBreak: 'break-all' }}>
          <strong>JID:</strong> {meta.jid}
        </div>
        <div>
          <strong>Members from API:</strong> {meta.membersCount}
        </div>
        <div>
          <strong>Type:</strong> {meta.type || '—'}
        </div>
        <div>
          <strong>Created:</strong> {meta.createdAt || '—'}
        </div>
      </div>
    )}
  </div>
);

const OtherTab: React.FC<{ jid: string }> = ({ jid }) => {
  const [counter, setCounter] = useState(0);
  return (
    <div style={{ padding: 24, fontSize: 14 }}>
      <h3 style={{ margin: '0 0 12px' }}>Other stuff</h3>
      <p style={{ marginTop: 0, color: '#52525B' }}>
        Local-state placeholder for room <code>{jid}</code>.
      </p>
      <button
        onClick={() => setCounter((c) => c + 1)}
        style={{
          border: '1px solid #E4E4E7',
          background: 'white',
          borderRadius: 8,
          padding: '6px 12px',
          cursor: 'pointer',
        }}
      >
        Counter: {counter}
      </button>
    </div>
  );
};

const ChatTab: React.FC<{ user: AppUser; roomJid: string }> = ({
  user,
  roomJid,
}) => {
  // No external dispatch needed — package now reacts to roomJID prop
  // changes (useChatWrapperInit.ensureActiveRoomSelected treats prop
  // as authoritative).
  const config = useMemo(
    () => ({
      ...BASE_CONFIG,
      initBeforeLoad: true,
      userLogin: { enabled: true, user },
      setRoomJidInPath: false,
      // Mirrors the production single-chat config that surfaces bug 1.
      enableRoomsRetry: {
        enabled: true,
        helperText: 'Initializing chat…',
      },
    }),
    [user.xmppUsername, user.xmppPassword, user.token]
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <Chat
        config={config as any}
        roomJID={roomJid}
        MainComponentStyles={{
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      />
    </div>
  );
};

const RoomView: React.FC<{
  user: AppUser;
  roomJid: string;
  meta?: RoomMeta;
  activeTab: RoomTab;
  onTabChange: (t: RoomTab) => void;
}> = ({ user, roomJid, meta, activeTab, onTabChange }) => (
  <div
    style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: '#fff',
      borderRadius: 16,
      border: '1px solid #E4E4E7',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid #E4E4E7',
      }}
    >
      <strong style={{ fontSize: 16 }}>{meta?.title || roomJid}</strong>
    </div>
    <div
      style={{
        display: 'flex',
        gap: 4,
        padding: '0 12px',
        borderBottom: '1px solid #E4E4E7',
      }}
    >
      {ROOM_TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '10px 14px',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? PRIMARY : '#52525B',
              borderBottom: `2px solid ${isActive ? PRIMARY : 'transparent'}`,
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {activeTab === 'description' && (
        <DescriptionTab key={`desc-${roomJid}`} meta={meta} />
      )}
      {activeTab === 'other' && <OtherTab key={`other-${roomJid}`} jid={roomJid} />}
      {activeTab === 'chat' && (
        <ChatTab user={user} roomJid={roomJid} />
      )}
    </div>
  </div>
);

const AuthedShell: React.FC<{ user: AppUser; onLogout: () => void }> = ({
  user,
  onLogout,
}) => {
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RoomTab>('chat');
  const [rooms, setRooms] = useState<RoomMeta[]>([]);

  const config = useMemo(
    () => ({
      ...BASE_CONFIG,
      initBeforeLoad: true,
      userLogin: { enabled: true, user },
    }),
    [user.xmppUsername, user.xmppPassword, user.token]
  );

  const meta = selectedJid ? rooms.find((r) => r.jid === selectedJid) : undefined;

  return (
    <XmppProvider config={config as any}>
      <div
        style={{
          height: '100vh',
          width: '100%',
          display: 'flex',
          gap: 16,
          padding: 16,
          background: '#f5f5f5',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ flex: '0 0 360px', maxWidth: 360, display: 'flex', minHeight: 0 }}>
          <HomeScreen
            user={user}
            onSelect={setSelectedJid}
            selectedJid={selectedJid}
            onLogout={onLogout}
            onRoomsLoaded={setRooms}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {selectedJid ? (
            <RoomView
              user={user}
              roomJid={selectedJid}
              meta={meta}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#71717A',
                fontSize: 14,
                background: 'white',
                border: '1px solid #E4E4E7',
                borderRadius: 16,
              }}
            >
              Pick a room from the list →
            </div>
          )}
        </div>
      </div>
    </XmppProvider>
  );
};

export default function AppLoginChatsNpm() {
  const [user, setUser] = useState<AppUser | null>(null);
  if (!user) return <LoginScreen onLogin={setUser} />;
  return <AuthedShell user={user} onLogout={() => setUser(null)} />;
}
