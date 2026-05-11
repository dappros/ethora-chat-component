import React, { useEffect, useMemo, useState } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';

import { store, persistor, RootState } from './roomStore';
import { setCurrentRoom } from './roomStore/roomsSlice';
import { XmppProvider, useXmppClient } from './context/xmppProvider';
import { ToastProvider } from './context/ToastContext';
import { CustomComponentsProvider } from './context/CustomComponentsContext';

import LoginForm from './components/AuthForms/Login';
import ChatRoom from './components/MainComponents/ChatRoom';
import Loader from './components/styled/Loader';
import {
  StyledLoaderWrapper,
  ChatContainer,
} from './components/styled/StyledComponents';
import { ChatWrapperBox } from './components/styled/ChatWrapperBox';

import { IConfig, ApiRoom } from './types/types';
import { logoutService } from './hooks/useLogout';
import { useUnreadMessagesCounter } from './hooks/useUnreadMessagesCounter';
import http, { setBaseURL } from './networking/apiClient';

const BASE_CONFIG: IConfig = {
  appId: '646cc8dc96d4a4dc8f7b2f2d',
  baseUrl: 'https://api.chat.ethora.com/v1',
  xmppSettings: {
    devServer: 'wss://xmpp.chat.ethora.com/ws',
    host: 'xmpp.chat.ethora.com',
    conference: 'conference.xmpp.chat.ethora.com',
    xmppPingOnSendEnabled: true,
  },
  colors: { primary: '#5E3FDE', secondary: '#E1E4FE' },
  refreshTokens: { enabled: true },
  chatRoomStyles: { borderRadius: '16px' },
  roomListStyles: { borderRadius: '16px' },
  disableRooms: true,
};

if (BASE_CONFIG.baseUrl) {
  setBaseURL(BASE_CONFIG.baseUrl, BASE_CONFIG.customAppToken);
}

const isLoggedInUser = (user: RootState['chatSettingStore']['user']) =>
  Boolean(user?.xmppUsername && user?.xmppPassword && user?.token);

interface MyChatItem {
  jid: string;
  name: string;
}

const apiRoomToItem = (room: ApiRoom, conference: string): MyChatItem | null => {
  if (!room?.name) return null;
  return {
    jid: `${room.name}@${conference}`,
    name: room?.title || room?.name,
  };
};

const UnreadBadge: React.FC<{ value: string | number; primary?: boolean }> = ({
  value,
  primary,
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
      background: primary ? BASE_CONFIG.colors?.primary : '#E5484D',
      color: '#fff',
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1,
    }}
  >
    {value}
  </span>
);

type RoomTab = 'description' | 'other' | 'chat';

const ROOM_TABS: { id: RoomTab; label: string }[] = [
  { id: 'description', label: 'Description' },
  { id: 'other', label: 'Other stuff' },
  { id: 'chat', label: 'Chat' },
];

const ChatTabContent: React.FC<{ roomJid: string }> = ({ roomJid }) => {
  const dispatch = useDispatch();
  const { client } = useXmppClient();
  const room = useSelector((s: RootState) => s.rooms.rooms[roomJid]);

  useEffect(() => {
    dispatch(setCurrentRoom({ roomJID: roomJid }));
    return () => {
      dispatch(setCurrentRoom({ roomJID: null }));
    };
  }, [dispatch, roomJid]);

  useEffect(() => {
    if (!client || !roomJid) return;
    client.promoteRoomHistory?.(roomJid);
    if (!room?.historyComplete && (room?.messages?.length ?? 0) < 30) {
      client.getHistoryStanza?.(roomJid, 30, undefined, undefined, {
        source: 'active',
        coalesceRoom: true,
        skipIfPreloaded: true,
      });
    }
  }, [client, roomJid, room?.historyComplete, room?.messages?.length]);

  return (
    <ChatContainer style={{ flex: 1, minHeight: 0 }}>
      <ChatRoom />
    </ChatContainer>
  );
};

const DescriptionTabContent: React.FC<{ roomJid: string }> = ({ roomJid }) => {
  const room = useSelector((s: RootState) => s.rooms.rooms[roomJid]);
  return (
    <div style={{ padding: 24, fontSize: 14, color: '#27272A' }}>
      <h3 style={{ margin: '0 0 12px' }}>Description</h3>
      <div style={{ display: 'grid', gap: 6 }}>
        <div>
          <strong>Title:</strong> {room?.title || room?.name || '—'}
        </div>
        <div style={{ wordBreak: 'break-all' }}>
          <strong>JID:</strong> {roomJid}
        </div>
        <div>
          <strong>Members in store:</strong>{' '}
          {Array.isArray(room?.members) ? room.members.length : '—'}
        </div>
        <div>
          <strong>usersCnt:</strong> {room?.usersCnt ?? '—'}
        </div>
        <div>
          <strong>Type:</strong> {room?.type || '—'}
        </div>
        <div>
          <strong>Created:</strong> {room?.createdAt || '—'}
        </div>
      </div>
    </div>
  );
};

const OtherTabContent: React.FC<{ roomJid: string }> = ({ roomJid }) => {
  const [counter, setCounter] = useState(0);
  return (
    <div style={{ padding: 24, fontSize: 14, color: '#27272A' }}>
      <h3 style={{ margin: '0 0 12px' }}>Other stuff</h3>
      <p style={{ marginTop: 0, color: '#52525B' }}>
        Placeholder tab for room <code>{roomJid}</code>. Has its own local state
        so you can verify whether the parent re-mounts on tab/room switches.
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

interface RoomViewProps {
  roomJid: string;
  activeTab: RoomTab;
  onTabChange: (tab: RoomTab) => void;
}

const RoomView: React.FC<RoomViewProps> = ({
  roomJid,
  activeTab,
  onTabChange,
}) => {
  const room = useSelector((s: RootState) => s.rooms.rooms[roomJid]);

  return (
    <ChatWrapperBox style={{ height: '100%', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          borderBottom: '1px solid #E4E4E7',
          background: '#fff',
        }}
      >
        <strong style={{ fontSize: 16 }}>
          {room?.title || room?.name || roomJid}
        </strong>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '0 12px',
          borderBottom: '1px solid #E4E4E7',
          background: '#fff',
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
                color: isActive ? BASE_CONFIG.colors?.primary : '#52525B',
                borderBottom: `2px solid ${
                  isActive ? BASE_CONFIG.colors?.primary : 'transparent'
                }`,
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
          <DescriptionTabContent key={`desc-${roomJid}`} roomJid={roomJid} />
        )}
        {activeTab === 'other' && (
          <OtherTabContent key={`other-${roomJid}`} roomJid={roomJid} />
        )}
        {activeTab === 'chat' && (
          <ChatTabContent roomJid={roomJid} />
        )}
      </div>
    </ChatWrapperBox>
  );
};

const HomeScreen: React.FC<{
  onSelect: (jid: string) => void;
  selectedJid: string | null;
}> = ({ onSelect, selectedJid }) => {
  const user = useSelector((s: RootState) => s.chatSettingStore.user);
  const { hasUnread, displayTotal, displayByRoom, unreadByRoom } =
    useUnreadMessagesCounter();

  const [items, setItems] = useState<MyChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const conference = BASE_CONFIG.xmppSettings?.conference || '';
    const token = user?.token || '';

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await http.get<{ items: ApiRoom[] }>('/chats/my', {
          headers: { Authorization: token },
        });
        if (cancelled) return;
        const list = (response.data?.items || [])
          .map((room) => apiRoomToItem(room, conference))
          .filter((item): item is MyChatItem => Boolean(item));
        setItems(list);
      } catch (e) {
        if (!cancelled) setError('Failed to load chats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.token]);

  const handleLogout = async () => {
    await logoutService.performLogout();
  };

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
            <UnreadBadge value={hasUnread ? displayTotal : 0} primary={!hasUnread} />
          </div>
        </div>
        <button
          onClick={handleLogout}
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
        Your chats
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {loading && items.length === 0 ? (
          <StyledLoaderWrapper
            style={{
              alignItems: 'center',
              flexDirection: 'column',
              gap: 10,
              padding: 24,
            }}
          >
            <Loader color={BASE_CONFIG.colors?.primary} style={{ margin: 0 }} />
            <div>Loading chats…</div>
          </StyledLoaderWrapper>
        ) : error ? (
          <div style={{ padding: 20, color: '#E5484D' }}>{error}</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 20, color: '#71717A' }}>No chats yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((item) => {
              const unreadCount = unreadByRoom[item.jid] || 0;
              const unreadLabel = displayByRoom[item.jid];
              const isActive = selectedJid === item.jid;
              return (
                <li key={item.jid}>
                  <button
                    onClick={() => onSelect(item.jid)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '14px 20px',
                      border: 'none',
                      borderBottom: '1px solid #F1F1F4',
                      borderLeft: `3px solid ${
                        isActive ? BASE_CONFIG.colors?.primary : 'transparent'
                      }`,
                      background: isActive
                        ? BASE_CONFIG.colors?.secondary
                        : 'white',
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
                      {item.name}
                    </span>
                    {unreadCount > 0 && (
                      <UnreadBadge value={unreadLabel ?? unreadCount} />
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

const DEFAULT_ROOM_TAB: RoomTab = 'chat';

const EmptyRoomPane: React.FC = () => (
  <ChatWrapperBox style={{ height: '100%', width: '100%' }}>
    <StyledLoaderWrapper
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        color: '#71717A',
        fontSize: 14,
      }}
    >
      Pick a room from the list →
    </StyledLoaderWrapper>
  </ChatWrapperBox>
);

const AuthedShell: React.FC = () => {
  const [selectedRoomJid, setSelectedRoomJid] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RoomTab>(DEFAULT_ROOM_TAB);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        gap: 16,
        minHeight: 0,
      }}
    >
      <div
        style={{
          flex: '0 0 360px',
          maxWidth: 360,
          display: 'flex',
          minHeight: 0,
        }}
      >
        <HomeScreen
          onSelect={setSelectedRoomJid}
          selectedJid={selectedRoomJid}
        />
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {selectedRoomJid ? (
          <RoomView
            roomJid={selectedRoomJid}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        ) : (
          <EmptyRoomPane />
        )}
      </div>
    </div>
  );
};

const Bridge: React.FC = () => {
  const user = useSelector((s: RootState) => s.chatSettingStore.user);
  const loggedIn = isLoggedInUser(user);

  const xmppConfig = useMemo<IConfig>(
    () => ({
      ...BASE_CONFIG,
      initBeforeLoad: true,
      userLogin: { enabled: true, user },
    }),
    [user.xmppUsername, user.xmppPassword, user.token]
  );

  if (!loggedIn) {
    return (
      <div style={{ height: '100vh', width: '100%' }}>
        <LoginForm config={BASE_CONFIG} />
      </div>
    );
  }

  return (
    <XmppProvider config={xmppConfig}>
      <CustomComponentsProvider>
        <div
          style={{
            height: '100vh',
            width: '100%',
            display: 'flex',
            background: '#f5f5f5',
            padding: 16,
            boxSizing: 'border-box',
          }}
        >
          <AuthedShell />
        </div>
      </CustomComponentsProvider>
    </XmppProvider>
  );
};

export default function AppLoginChats() {
  return (
    <Provider store={store}>
      <PersistGate loading={<Loader />} persistor={persistor}>
        <ToastProvider>
          <Bridge />
        </ToastProvider>
      </PersistGate>
    </Provider>
  );
}
