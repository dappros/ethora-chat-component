import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { renderWithProviders } from '../../test/renderWithProviders';
import chatSettingsSlice from '../../roomStore/chatSettingsSlice';
import roomsSlice from '../../roomStore/roomsSlice';
import roomHeapSlice from '../../roomStore/roomHeapSlice';
import callSlice from '../../roomStore/callSlice';
import trustSafetySlice from '../../roomStore/trustSafetySlice';
import { ToastProvider } from '../../context/ToastContext';
import type { IMessage, IRoom } from '../../types/types';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: { sendMessageReactionStanza: vi.fn(), leaveTheRoomStanza: vi.fn() },
    setClient: vi.fn(),
  }),
}));

import { Message } from '../MessageBubble/Message';
import ChatRoomItem from '../RoomComponents/ChatRoomItem';
import ChatProfileMemberRow from '../Modals/ChatProfileModal/ChatProfileMemberRow';
import ChatHeader from '../MainComponents/ChatHeader';
import UserProfileModal from '../Modals/UserProfileModal/UserProfileModal';
import { SuspendedPeerNotice, SuspendedPeerTestIds } from './SuspendedPeer';

const ME = 'app1_me';
const PEER = 'app1_bob';
const DM = 'dm1@conference.xmpp.example.com';

const suspendedPeers = (names: string[] = [PEER]) => ({
  policy: {},
  age: {
    status: 'idle',
    birthYear: null,
    isAdult: null,
    declaredAt: null,
    canDeclareAdult: true,
  },
  revealed: {},
  blocked: {},
  peers: Object.fromEntries(
    names.map((name) => [name, { suspended: true, checkedAt: Date.now() }])
  ),
});

const dm = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: DM,
    name: 'Bob Example',
    title: 'Bob Example',
    type: 'private',
    usersCnt: 2,
    messages: [],
    members: [
      { _id: '1', xmppUsername: ME, firstName: 'Me', lastName: '' },
      { _id: '2', xmppUsername: PEER, firstName: 'Bob', lastName: 'Example' },
    ],
    ...overrides,
  }) as unknown as IRoom;

const state = (extra: Record<string, unknown> = {}) =>
  ({
    chatSettingStore: { user: { xmppUsername: ME }, config: {} },
    rooms: { rooms: { [DM]: dm() }, usersSet: {} },
    trustSafety: suspendedPeers(),
    ...extra,
  }) as never;

const badges = () => screen.queryAllByTestId(SuspendedPeerTestIds.badge);

describe('suspended accounts: badges', () => {
  it('message header of a suspended sender', () => {
    renderWithProviders(
      <Message
        message={
          {
            id: 'm1',
            body: 'hello',
            date: new Date().toISOString(),
            roomJid: DM,
            user: { id: PEER, name: 'Bob Example' },
          } as IMessage
        }
        isUser={false}
        isReply={false}
      />,
      { preloadedState: state() }
    );
    expect(badges()).toHaveLength(1);
    expect(badges()[0]).toHaveTextContent('Suspended');
  });

  it('no badge for an account that is not suspended', () => {
    renderWithProviders(
      <Message
        message={
          {
            id: 'm1',
            body: 'hello',
            date: new Date().toISOString(),
            roomJid: DM,
            user: { id: 'app1_carol', name: 'Carol' },
          } as IMessage
        }
        isUser={false}
        isReply={false}
      />,
      { preloadedState: state() }
    );
    expect(badges()).toHaveLength(0);
  });

  it('private chat item in the room list', () => {
    renderWithProviders(
      <ChatRoomItem
        chat={dm()}
        isChatActive={false}
        performClick={() => {}}
        config={{} as never}
      />,
      { preloadedState: state() }
    );
    expect(badges()).toHaveLength(1);
  });

  it('member list row', () => {
    renderWithProviders(
      <ChatProfileMemberRow
        member={{
          _id: '2',
          xmppUsername: PEER,
          firstName: 'Bob',
          lastName: 'Example',
        }}
        isLast
        disableClick={false}
        online={false}
        showMenu={false}
        menuOptions={[]}
        moreOptionsLabel="More"
        onAvatarClick={() => {}}
      />,
      { preloadedState: state() }
    );
    expect(badges()).toHaveLength(1);
  });

  it('config.disableSuspendedPeers hides them', () => {
    renderWithProviders(
      <ChatRoomItem
        chat={dm()}
        isChatActive={false}
        performClick={() => {}}
        config={{} as never}
      />,
      {
        preloadedState: state({
          chatSettingStore: {
            user: { xmppUsername: ME },
            config: { disableSuspendedPeers: true },
          },
        }),
      }
    );
    expect(badges()).toHaveLength(0);
  });
});

describe('suspended accounts: 1:1 chat', () => {
  const renderHeader = (peers: string[]) => {
    const store = configureStore({
      reducer: {
        chatSettingStore: chatSettingsSlice,
        rooms: roomsSlice,
        roomHeapSlice,
        call: callSlice,
        trustSafety: trustSafetySlice,
      },
      preloadedState: {
        chatSettingStore: {
          config: {
            videoCalls: {
              enabled: true,
              livekitUrl: 'wss://lk.example.com',
              enableAudioCalls: true,
            },
          },
          user: { xmppUsername: ME, fileToken: '' },
        },
        rooms: { rooms: { [DM]: dm() }, activeRoomJID: DM, presenceByRoom: {} },
        trustSafety: suspendedPeers(peers),
      } as any,
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, immutableCheck: false }),
    });
    return render(
      <Provider store={store}>
        <ToastProvider>
          <ChatHeader currentRoom={dm()} />
        </ToastProvider>
      </Provider>
    );
  };

  it('hides the call buttons and shows the badge', () => {
    renderHeader([PEER]);
    expect(screen.queryByLabelText(/video call/i)).toBeNull();
    expect(screen.queryByLabelText(/audio call/i)).toBeNull();
    expect(badges()).toHaveLength(1);
  });

  it('keeps them for a partner who is not suspended', () => {
    renderHeader([]);
    expect(screen.queryByLabelText(/video call/i)).toBeTruthy();
    expect(badges()).toHaveLength(0);
  });

  it('the composer notice is translated', () => {
    renderWithProviders(<SuspendedPeerNotice />, {
      preloadedState: state({
        chatSettingStore: {
          user: { xmppUsername: ME },
          config: { i18n: { locale: 'es' } },
        },
      }),
    });
    expect(screen.getByTestId(SuspendedPeerTestIds.notice)).toHaveTextContent(
      'Esta cuenta está suspendida. No puedes enviarle mensajes ni llamarla.'
    );
  });

  it('a bounced message says why and offers no retry', () => {
    renderWithProviders(
      <Message
        message={
          {
            id: 'out-1',
            body: 'are you there?',
            date: new Date().toISOString(),
            roomJid: DM,
            pending: false,
            failed: true,
            failedReason: 'peer-suspended',
            user: { id: ME, name: 'Me' },
          } as IMessage
        }
        isUser
        isReply={false}
      />,
      { preloadedState: state() }
    );
    expect(
      screen.getByText('Not delivered: this account is suspended')
    ).toBeInTheDocument();
    expect(screen.queryByText('Retry')).toBeNull();
  });
});

describe('suspended accounts: profile', () => {
  const renderProfile = (peers: string[]) => {
    const store = configureStore({
      reducer: {
        chatSettingStore: chatSettingsSlice,
        rooms: roomsSlice,
        roomHeapSlice,
        call: callSlice,
        trustSafety: trustSafetySlice,
      },
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: ME, firstName: 'Me', lastName: '' },
          selectedUser: {
            id: 'u2',
            name: 'Bob Example',
            firstName: 'Bob',
            lastName: 'Example',
            userJID: PEER,
          },
          config: {
            videoCalls: { enabled: true, livekitUrl: 'wss://lk.example.com' },
          },
        },
        rooms: { rooms: {}, usersSet: {} },
        trustSafety: suspendedPeers(peers),
      } as any,
      middleware: (getDefault) =>
        getDefault({ serializableCheck: false, immutableCheck: false }),
    });
    return render(
      <Provider store={store}>
        <ToastProvider>
          <UserProfileModal handleCloseModal={() => {}} />
        </ToastProvider>
      </Provider>
    );
  };

  it('hides Message and Call for a suspended account and shows the badge', () => {
    renderProfile([PEER]);
    expect(badges()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^message$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^call$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /copy user id/i })).toBeTruthy();
  });

  it('offers them otherwise', () => {
    renderProfile([]);
    expect(badges()).toHaveLength(0);
    expect(screen.getByRole('button', { name: /^message$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^call$/i })).toBeTruthy();
  });
});
