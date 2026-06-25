import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

// To test against the published npm package instead of local src, replace
// these imports with:
//   import { XmppProvider, Chat, useUnread, logoutService } from '@ethora/chat-component';
// (after `npm install @ethora/chat-component@26.3.21`). The local src
// already matches 26.3.21
// identical — using local lets HMR pick up further fixes without a reinstall.
import { XmppProvider, useXmppClient } from './context/xmppProvider';
import { ReduxWrapper as Chat } from './components/MainComponents/ReduxWrapper';
import { useUnread } from './hooks/useUnreadMessagesCounter';
import { logoutService } from './hooks/useLogout';
import { store } from './roomStore';
import { addRoomViaApi } from './roomStore/roomsSlice';
import { createRoomFromApi } from './helpers/createRoomFromApi';
import { invalidateRoomsCache } from './networking/api-requests/rooms.api';
import type { ApiRoom } from './types/types';

// JWT-based bootstrap — no email/password login screen, no customAppToken.
// XmppProvider receives `jwtLogin.token`, exchanges it via POST /users/client
// for an Ethora user-auth token + xmpp creds, then connects. Mirrors the
// production patient flow (see Slack thread).
const BASE_URL = 'https://api.messenger.ethora-qa.com/v1';
const CONFERENCE = 'conference.xmpp.messenger.ethora-qa.com';

const BASE_CONFIG = {
  baseUrl: BASE_URL,
  xmppSettings: {
    devServer: 'wss://xmpp.messenger.ethora-qa.com/ws',
    host: 'xmpp.messenger.ethora-qa.com',
    conference: CONFERENCE,
    xmppPingOnSendEnabled: true,
  },
  colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
  refreshTokens: { enabled: true },
  disableRooms: true,
   typography: {                                                                                        
       fontFamily: 'Georgia, serif',                                                                      
       },
} as const;

// Default JWT pre-filled in the textarea so the dev can hit "Connect" and go.

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

type AppUser = {
  token: string;
  refreshToken?: string;
  xmppUsername: string;
  xmppPassword: string;
  firstName?: string;
  email?: string;
  _id?: string;
};

// JWT mode keeps the raw JWT — XmppProvider does its own /users/client
// exchange via `jwtLogin.token`. The wrapper does a *separate* exchange
// purely for /chats/my.
//
// Email mode pre-resolves the user via POST /users/login-with-email in
// LoginScreen (the package's email-login fallback in LoginWrapper is
// effectively dead because the `user`-vs-`loginData` prop renames never
// reached `<Chat>`). The resolved user is then handed to both <Chat>'s
// config and the parent XmppProvider's config as `userLogin.user`, so
// no further login round-trips happen inside the package.
type LoginPayload =
  | { mode: 'jwt'; jwt: string }
  | { mode: 'email'; user: AppUser; appToken: string };

// Persist the resolved LoginPayload so a page refresh restores the session
// instead of bouncing back to the login screen. Cleared on explicit logout.
const SESSION_STORAGE_KEY = 'ethora-test-app-login-payload';

const loadPersistedPayload = (): LoginPayload | null => {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LoginPayload;
    if (parsed?.mode === 'jwt' && parsed.jwt) return parsed;
    if (parsed?.mode === 'email' && parsed.user?.token && parsed.appToken) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const persistPayload = (p: LoginPayload) => {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota / serialization errors */
  }
};

const clearPersistedPayload = () => {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

// Mirrors the package's `loginViaJwt` (auth.api.ts): POST /users/client
// with no body and the raw client JWT in `x-custom-token`.
const resolveUserFromJwt = async (jwt: string): Promise<AppUser> => {
  const res = await axios.post(
    `${BASE_URL}/users/client`,
    null,
    { headers: { 'x-custom-token': jwt } }
  );
  const data = res.data || {};
  const user: AppUser = {
    ...data.user,
    token: data.token,
    refreshToken: data.refreshToken,
  };
  if (!user.token || !user.xmppUsername || !user.xmppPassword) {
    throw new Error('JWT exchange returned incomplete user');
  }
  return user;
};

const resolveUserFromEmail = async (
  email: string,
  password: string,
  appToken: string
): Promise<AppUser> => {
  const res = await axios.post(
    `${BASE_URL}/users/login-with-email`,
    { email, password },
    { headers: { Authorization: appToken } }
  );
  const data = res.data || {};
  const user: AppUser = {
    ...data.user,
    token: data.token,
    refreshToken: data.refreshToken,
  };
  if (!user.token || !user.xmppUsername || !user.xmppPassword) {
    throw new Error('Email login returned incomplete user');
  }
  return user;
};

const resolveUserFromPayload = (p: LoginPayload): Promise<AppUser> =>
  p.mode === 'jwt' ? resolveUserFromJwt(p.jwt) : Promise.resolve(p.user);

type LoginMode = 'jwt' | 'email';

const inputStyle = {
  padding: 10,
  border: `1px solid ${PRIMARY}`,
  borderRadius: 6,
  fontSize: 14,
} as const;

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '10px 14px',
  border: 'none',
  background: active ? PRIMARY : 'transparent',
  color: active ? 'white' : '#52525B',
  fontWeight: active ? 600 : 400,
  cursor: 'pointer',
  borderRadius: 6,
});

// Simple JWT-only entry screen.
const JwtInputScreen: React.FC<{ onSubmit: (p: LoginPayload) => void }> = ({
  onSubmit,
}) => {
  const [jwt, setJwt] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = jwt.trim();
    if (!trimmed) return;
    onSubmit({ mode: 'jwt', jwt: trimmed });
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
          width: 520,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <strong>Test app — paste a custom client JWT</strong>
        <div style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>
          The XmppProvider will POST this token to <code>/users/client</code>{' '}
          (jwtLogin flow) and use the returned creds to connect to XMPP. No
          email/password, no customAppToken.
        </div>
        <textarea
          value={jwt}
          onChange={(e) => setJwt(e.target.value)}
          placeholder="eyJhbGciOi..."
          rows={6}
          style={{
            ...inputStyle,
            fontFamily: 'monospace',
            fontSize: 12,
            resize: 'vertical',
          }}
        />
        <button
          type="submit"
          style={{
            padding: 10,
            background: PRIMARY,
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Connect
        </button>
      </form>
    </div>
  );
};

// Exported so it can be wired into the default export when the toggleable
// jwt-vs-email picker is desired. Also avoids the TS6133 unused warning
// while keeping the component available alongside <JwtInputScreen />.
export const LoginScreen: React.FC<{ onSubmit: (p: LoginPayload) => void }> = ({
  onSubmit,
}) => {
  const [mode, setMode] = useState<LoginMode>('jwt');

  // JWT mode state
  const [jwt, setJwt] = useState('');

  // Email mode state
  const [appToken, setAppToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'jwt') {
      const trimmed = jwt.trim();
      if (!trimmed) {
        setError('Paste a JWT');
        return;
      }
      onSubmit({ mode: 'jwt', jwt: trimmed });
      return;
    }

    // mode === 'email' — resolve the user up-front so we can hand it
    // straight to `userLogin.user` for both <Chat> and XmppProvider.
    const trimmedAppToken = appToken.trim();
    const trimmedEmail = email.trim();
    if (!trimmedAppToken) {
      setError('App token required for email login');
      return;
    }
    if (!trimmedEmail || !password) {
      setError('Email and password required');
      return;
    }
    setBusy(true);
    try {
      const user = await resolveUserFromEmail(trimmedEmail, password, trimmedAppToken);
      onSubmit({ mode: 'email', user, appToken: trimmedAppToken });
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
          width: 520,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <strong>Test app — choose a login mode</strong>

        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 4,
            background: '#F4F4F5',
            borderRadius: 8,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setMode('jwt');
              setError(null);
            }}
            style={tabBtnStyle(mode === 'jwt')}
          >
            jwtLogin (custom JWT)
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('email');
              setError(null);
            }}
            style={tabBtnStyle(mode === 'email')}
          >
            email + appToken
          </button>
        </div>

        {mode === 'jwt' ? (
          <>
            <div style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>
              XmppProvider will POST this token to <code>/users/client</code>{' '}
              (jwtLogin flow). No appToken needed.
            </div>
            <textarea
              value={jwt}
              onChange={(e) => setJwt(e.target.value)}
              placeholder="eyJhbGciOi..."
              rows={6}
              style={{
                ...inputStyle,
                fontFamily: 'monospace',
                fontSize: 12,
                resize: 'vertical',
              }}
            />
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#71717A', lineHeight: 1.5 }}>
              POST <code>/users/login-with-email</code> with this appToken as
              Authorization. The resolved user is fed to XmppProvider AND
              to <code>&lt;Chat&gt;</code> as <code>userLogin.user</code>;
              appToken stays as <code>customAppToken</code> for downstream
              API calls.
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#52525B' }}>App token</span>
              <textarea
                value={appToken}
                onChange={(e) => setAppToken(e.target.value)}
                placeholder="JWT eyJhbGc..."
                rows={3}
                style={{
                  ...inputStyle,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  resize: 'vertical',
                }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#52525B' }}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#52525B' }}>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
              />
            </label>
          </>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            padding: 10,
            background: PRIMARY,
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Logging in…' : 'Connect'}
        </button>
        {error && <div style={{ color: '#E5484D', fontSize: 13 }}>{error}</div>}
      </form>
    </div>
  );
};

const apiRoomToMeta = (room: ApiRoomItem) => ({
  jid: `${room.name}@${CONFERENCE}`,
  name: room.name,
  title: room.title || room.name,
  membersCount: Array.isArray(room.members) ? room.members.length : 0,
  type: room.type,
  createdAt: room.createdAt,
});

type RoomMeta = ReturnType<typeof apiRoomToMeta>;

const parseMembers = (raw: string): string[] => {
  const seen = new Set<string>();
  return raw
    .split(/[\s,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s || seen.has(s)) return false;
      seen.add(s);
      return true;
    });
};

type CreateChatPayload = {
  title: string;
  type: 'public' | 'group';
  description?: string;
  members?: string[];
};

const createChatViaApi = async (
  token: string,
  payload: CreateChatPayload
): Promise<ApiRoomItem | null> => {
  const res = await axios.post(
    `${BASE_URL}/chats`,
    payload,
    { headers: { Authorization: token } }
  );
  return res.data?.result || res.data || null;
};

const addMembersViaApi = async (
  token: string,
  chatName: string,
  members: string[]
): Promise<void> => {
  await axios.post(
    `${BASE_URL}/chats/users-access`,
    { chatName: `${chatName}`, members },
    { headers: { Authorization: token } }
  );
};

const CreateChatModal: React.FC<{
  onClose: () => void;
  onCreate: (p: CreateChatPayload) => Promise<void>;
}> = ({ onClose, onCreate }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'public' | 'group'>('public');
  const [description, setDescription] = useState('');
  const [membersRaw, setMembersRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedMembers = useMemo(() => parseMembers(membersRaw), [membersRaw]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length < 3) {
      setError('Title must be at least 3 characters');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        title: trimmed,
        type,
        description: description.trim() || undefined,
        members: parsedMembers.length ? parsedMembers : undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          background: 'white',
          padding: 24,
          borderRadius: 12,
          width: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
        }}
      >
        <strong style={{ fontSize: 18 }}>Create new chat</strong>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: '#52525B' }}>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My new room"
            autoFocus
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: '#52525B' }}>Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'public' | 'group')}
            style={inputStyle}
          >
            <option value="public">public</option>
            <option value="group">group</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: '#52525B' }}>
            Description (optional)
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this room about?"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: '#52525B' }}>
            Members (optional) — xmppUsername, comma or newline separated
            {parsedMembers.length > 0 && (
              <span style={{ color: PRIMARY, fontWeight: 600 }}>
                {' '}
                · {parsedMembers.length} parsed
              </span>
            )}
          </span>
          <textarea
            value={membersRaw}
            onChange={(e) => setMembersRaw(e.target.value)}
            placeholder="alice123, bob456&#10;charlie789"
            rows={3}
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
          />
        </label>
        {error && <div style={{ color: '#E5484D', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              border: '1px solid #E4E4E7',
              background: 'white',
              borderRadius: 8,
              padding: '8px 14px',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            style={{
              border: 'none',
              background: PRIMARY,
              color: 'white',
              borderRadius: 8,
              padding: '8px 14px',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
};

const AddUsersModal: React.FC<{
  roomTitle: string;
  onClose: () => void;
  onAdd: (members: string[]) => Promise<void>;
}> = ({ roomTitle, onClose, onAdd }) => {
  const [membersRaw, setMembersRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedMembers = useMemo(() => parseMembers(membersRaw), [membersRaw]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedMembers.length === 0) {
      setError('Enter at least one xmppUsername');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd(parsedMembers);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Add failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          background: 'white',
          padding: 24,
          borderRadius: 12,
          width: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
        }}
      >
        <strong style={{ fontSize: 18 }}>Add users to "{roomTitle}"</strong>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: '#52525B' }}>
            xmppUsername, comma or newline separated
            {parsedMembers.length > 0 && (
              <span style={{ color: PRIMARY, fontWeight: 600 }}>
                {' '}
                · {parsedMembers.length} parsed
              </span>
            )}
          </span>
          <textarea
            value={membersRaw}
            onChange={(e) => setMembersRaw(e.target.value)}
            placeholder="alice123, bob456&#10;charlie789"
            rows={5}
            autoFocus
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
          />
        </label>
        {error && <div style={{ color: '#E5484D', fontSize: 13 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              border: '1px solid #E4E4E7',
              background: 'white',
              borderRadius: 8,
              padding: '8px 14px',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || parsedMembers.length === 0}
            style={{
              border: 'none',
              background: PRIMARY,
              color: 'white',
              borderRadius: 8,
              padding: '8px 14px',
              cursor: busy || parsedMembers.length === 0 ? 'not-allowed' : 'pointer',
              opacity: busy || parsedMembers.length === 0 ? 0.7 : 1,
            }}
          >
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  );
};

const HomeScreen: React.FC<{
  user: AppUser | null;
  rooms: RoomMeta[];
  loading: boolean;
  onSelect: (jid: string) => void;
  selectedJid: string | null;
  onLogout: () => void;
  onCreateClick: () => void;
}> = ({ user, rooms, loading, onSelect, selectedJid, onLogout, onCreateClick }) => {
  const { hasUnread, displayTotal, unreadByRoom, displayByRoom } = useUnread();

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
            Welcome{user?.firstName ? `, ${user.firstName}` : ''} 👋
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCreateClick}
            disabled={!user?.token}
            style={{
              border: 'none',
              background: PRIMARY,
              color: 'white',
              borderRadius: 8,
              padding: '6px 12px',
              cursor: user?.token ? 'pointer' : 'not-allowed',
              opacity: user?.token ? 1 : 0.5,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            + New chat
          </button>
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

const ChatTab: React.FC<{ payload: LoginPayload; roomJid: string }> = ({
  payload,
  roomJid,
}) => {
  // XmppProvider above already ran initBeforeLoad — ChatWrapper plugs
  // into the existing XMPP client. Email mode mirrors `userLogin` /
  // `customAppToken` onto <Chat>'s own config too, so if it ever mounts
  // standalone (no XmppProvider parent) it can still bootstrap.
  const config = useMemo(() => {
    const base = {
      ...BASE_CONFIG,
      setRoomJidInPath: false,
      enableRoomsRetry: { enabled: true, helperText: 'Initializing chat…' },
    };
    if (payload.mode === 'email') {
      return {
        ...base,
        customAppToken: payload.appToken,
        userLogin: { enabled: true, user: payload.user },
      };
    }
    return base;
  }, [payload]);

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
  payload: LoginPayload;
  roomJid: string;
  meta?: RoomMeta;
  activeTab: RoomTab;
  onTabChange: (t: RoomTab) => void;
  onAddUsersClick: () => void;
}> = ({ payload, roomJid, meta, activeTab, onTabChange, onAddUsersClick }) => (
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
        gap: 12,
        padding: '12px 16px',
        borderBottom: '1px solid #E4E4E7',
      }}
    >
      <strong style={{ fontSize: 16 }}>{meta?.title || roomJid}</strong>
      <button
        onClick={onAddUsersClick}
        disabled={!meta}
        style={{
          border: 'none',
          background: PRIMARY,
          color: 'white',
          borderRadius: 8,
          padding: '6px 12px',
          cursor: meta ? 'pointer' : 'not-allowed',
          opacity: meta ? 1 : 0.5,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        + Add users
      </button>
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
      {activeTab === 'chat' && <ChatTab payload={payload} roomJid={roomJid} />}
    </div>
  </div>
);

// Inner shell — must live UNDER <XmppProvider> so it can consume the XMPP
// client via useXmppClient. The outer AuthedShell mounts the provider.
const AuthedShellInner: React.FC<{
  payload: LoginPayload;
  onLogout: () => void;
}> = ({ payload, onLogout }) => {
  const { client } = useXmppClient();
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RoomTab>('chat');
  // Wrapper does its own login here purely to get a token for /chats/my and
  // /chats mutations. The chat component does an independent login of its
  // own via XmppProvider.
  const [user, setUser] = useState<AppUser | null>(null);
  const [rooms, setRooms] = useState<RoomMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [addUsersOpen, setAddUsersOpen] = useState(false);

  const fetchRooms = async (token: string) => {
    const res = await axios.get<{ items: ApiRoomItem[] }>(
      `${BASE_URL}/chats/my`,
      { headers: { Authorization: token } }
    );
    const list = (res.data?.items || []).map(apiRoomToMeta);
    setRooms(list);
    return list;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setUser(null);
    setRooms([]);
    (async () => {
      try {
        const resolved = await resolveUserFromPayload(payload);
        if (cancelled) return;
        setUser(resolved);
        await fetchRooms(resolved.token);
      } catch (e) {
        if (!cancelled) setRooms([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const handleCreate = async (form: CreateChatPayload) => {
    if (!user?.token) throw new Error('Not authenticated');
    const created = await createChatViaApi(user.token, form);
    invalidateRoomsCache();
    const list = await fetchRooms(user.token);
    const newJid = created ? `${created.name}@${CONFERENCE}` : null;
    const target =
      (newJid && list.find((r) => r.jid === newJid)) || list[0];
    if (target) setSelectedJid(target.jid);
  };

  const handleAddUsers = async (members: string[]) => {
    if (!user?.token) throw new Error('Not authenticated');
    if (!selectedJid) throw new Error('No room selected');
    const target = rooms.find((r) => r.jid === selectedJid);
    if (!target) throw new Error('Room not found');

    // 1. Persist membership on the backend.
    await addMembersViaApi(user.token, target.name, members);

    // Drop the package-internal /chats/my cache so any later getRooms()
    // call inside the package re-fetches fresh data instead of replaying
    // a pre-mutation snapshot over our redux update below.
    invalidateRoomsCache();

    // 2. XMPP courtesy invite, so the invitee gets a MUC <invite/> they
    //    can act on. This does NOT, on its own, update other occupants'
    //    member counts — invitations are forwarded to the invitee, the
    //    server does not auto-emit an affiliation-change broadcast in
    //    response. So we don't rely on it for the display refresh; the
    //    deterministic update happens in step 3 below.
    if (client) {
      for (const username of members) {
        try {
          await client.inviteRoomRequestStanza(username, target.jid);
        } catch (e) {
          console.warn('[AppLoginChatsNpm] invite failed for', username, e);
        }
      }

      // One groupchat "members changed, refetch please" signal per
      // add operation (the receivers refetch /chats/my, which already
      // returns the full new member list — so per-user signals would
      // just multiply identical refetches). Receivers' stanza
      // handler (onMembersRefreshSignal) pulls authoritative member
      // data from REST and dispatches into the package's redux,
      // which is what makes the ChatHeader count refresh on OTHER
      // currently-connected users without depending on (a) the
      // invitee actually coming online and joining via presence, or
      // (b) the backend emitting its own MUC affiliation broadcast
      // on REST-driven /chats/users-access — neither is guaranteed.
      try {
        await client.notifyMembersChangedStanza(target.jid);
      } catch (e) {
        console.warn(
          '[AppLoginChatsNpm] notifyMembersChanged failed',
          e
        );
      }
    }

    // 3. Refetch /chats/my (bypassing any package-internal cache via our
    //    own axios call) and push the fresh room into the package's redux
    //    store via the same `addRoomViaApi` thunk its internal
    //    AddMembersModal uses. This is the reliable, synchronous path:
    //    no waiting on server-side XMPP affiliation broadcasts, which
    //    proved flaky (sometimes fire, sometimes not depending on the
    //    invitee's online state and the backend's choice to emit them
    //    on REST-driven membership changes).
    const res = await axios.get<{ items: ApiRoom[] }>(
      `${BASE_URL}/chats/my`,
      { headers: { Authorization: user.token } }
    );
    const freshList = res.data?.items || [];
    setRooms(
      freshList.map((r) => apiRoomToMeta(r as unknown as ApiRoomItem))
    );

    if (client) {
      const freshTarget = freshList.find((r) => r?.name === target.name);
      if (freshTarget) {
        const iRoom = createRoomFromApi(freshTarget, CONFERENCE);
        if (iRoom) {
          store.dispatch(
            addRoomViaApi({ room: iRoom, xmpp: client as any })
          );
        }
      }
    }
  };

  const meta = selectedJid ? rooms.find((r) => r.jid === selectedJid) : undefined;

  return (
    <>
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
            rooms={rooms}
            loading={loading}
            onSelect={setSelectedJid}
            selectedJid={selectedJid}
            onLogout={onLogout}
            onCreateClick={() => setCreateOpen(true)}
          />
        </div>
        <div style={{ flex: 1, display: 'flex', minHeight: 0, maxWidth: '80%' }}>
          {selectedJid ? (
            <RoomView
              payload={payload}
              roomJid={selectedJid}
              meta={meta}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onAddUsersClick={() => setAddUsersOpen(true)}
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
      {createOpen && (
        <CreateChatModal
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
        />
      )}
      {addUsersOpen && meta && (
        <AddUsersModal
          roomTitle={meta.title}
          onClose={() => setAddUsersOpen(false)}
          onAdd={handleAddUsers}
        />
      )}
    </>
  );
};

const AuthedShell: React.FC<{
  payload: LoginPayload;
  onLogout: () => void;
}> = ({ payload, onLogout }) => {
  // XmppProvider must wrap AuthedShellInner so the inner shell can consume
  // the XMPP client via useXmppClient (for inviteRoomRequestStanza /
  // getRoomInfoStanza in the add-users flow).
  const config = useMemo(() => {
    if (payload.mode === 'jwt') {
      // jwt → XmppProvider runs initBeforeLoad off `jwtLogin.token`.
      return {
        ...BASE_CONFIG,
        initBeforeLoad: true,
        jwtLogin: { enabled: true, token: payload.jwt },
      };
    }
    // email → user is already resolved upstream; hand it to userLogin
    // so initBeforeLoad has everything it needs (xmpp creds + token)
    // without a second /users/login-with-email round trip.
    return {
      ...BASE_CONFIG,
      initBeforeLoad: true,
      customAppToken: payload.appToken,
      userLogin: { enabled: true, user: payload.user },
    };
  }, [payload]);

  return (
    <XmppProvider config={config as any}>
      <AuthedShellInner payload={payload} onLogout={onLogout} />
    </XmppProvider>
  );
};

// Re-export under a name that matches the other entry screen contract,
// so the default export can swap freely between the simple jwt-only
// screen and the toggleable jwt/email picker.
export const JwtOnlyScreen = JwtInputScreen;

export default function AppLoginChatsNpm() {
  // Lazy initializer reads any persisted session from localStorage, so a
  // page refresh resumes straight into AuthedShell instead of the login UI.
  const [payload, setPayload] = useState<LoginPayload | null>(
    loadPersistedPayload
  );

  // Switch <LoginScreen /> → <JwtOnlyScreen /> here if you want to drop
  // the email mode from the entry UI. Both produce LoginPayload, so the
  // rest of AuthedShell stays the same.
  const handleLogin = useCallback((p: LoginPayload) => {
    persistPayload(p);
    setPayload(p);
  }, []);

  // useCallback so AuthedShell receives a stable `onLogout` reference
  // across renders. Without this, every parent render would propagate
  // a fresh prop into AuthedShell → XmppProvider → context value change
  // for any consumer that reads through identity, and was a plausible
  // trigger for downstream effect re-runs in the WS reconnect path.
  const handleLogout = useCallback(async () => {
    // Tear down the chat component first — disconnects the XMPP client,
    // clears redux user/rooms/heap, purges redux-persist, clears stored
    // creds and push subscriptions. Without this, a re-login in the same
    // tab inherits the dead socket and previous user from persisted state.
    try {
      await logoutService.performLogout();
    } catch (err) {
      console.warn('[AppLoginChatsNpm] logoutService failed', err);
    }
    clearPersistedPayload();
    setPayload(null);
  }, []);
  if (!payload) return <LoginScreen onSubmit={handleLogin} />;
  return <AuthedShell payload={payload} onLogout={handleLogout} />;
}
