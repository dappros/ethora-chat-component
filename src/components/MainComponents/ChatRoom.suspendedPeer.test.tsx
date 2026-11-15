import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { SuspendedPeerTestIds } from '../TrustSafety/SuspendedPeer';

const client = new Proxy({ status: 'online' } as Record<string, unknown>, {
  get(target, prop) {
    if (prop in target) return target[prop as string];
    return () => undefined;
  },
});
const xmppClientMock = {
  client,
  providerBootstrapStatus: 'ready',
  initMode: 'chat',
};

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => xmppClientMock,
}));
vi.mock('../../context/xmppProvider.tsx', () => ({
  useXmppClient: () => xmppClientMock,
}));
vi.mock('../../hooks/useRoomInitialization.tsx', () => ({
  useRoomInitialization: () => undefined,
}));
vi.mock('../../hooks/useRoomInitialization', () => ({
  useRoomInitialization: () => undefined,
}));

import ChatRoom from './ChatRoom';

const ME = 'app1_me';
const PEER = 'app1_bob';
const DM = 'dm1@conference.xmpp.example.com';

const renderChatRoom = (
  peers: Record<string, { suspended: boolean; checkedAt: number }>
) =>
  renderWithProviders(<ChatRoom />, {
    preloadedState: {
      chatSettingStore: {
        user: { xmppUsername: ME },
        config: { disableHeader: true },
      } as any,
      rooms: {
        rooms: {
          [DM]: {
            jid: DM,
            name: 'dm1',
            title: 'Bob Example',
            type: 'private',
            messages: [],
            members: [
              { _id: '1', xmppUsername: ME, firstName: 'Me', lastName: '' },
              {
                _id: '2',
                xmppUsername: PEER,
                firstName: 'Bob',
                lastName: 'Example',
              },
            ],
          },
        },
        activeRoomJID: DM,
        isChatUiVisible: true,
        editAction: { isEdit: false, roomJid: '', messageId: '', text: '' },
        isLoading: false,
        usersSet: {},
        presenceByRoom: {},
        reportRoom: { isOpen: false },
        subscribedRooms: [],
        pushSubscriptionStatus: {},
        drafts: {},
        roomsLoadedOnce: true,
        roomsLoadError: false,
      } as any,
      trustSafety: {
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
        peers,
      } as any,
    },
  });

describe('ChatRoom: 1:1 chat with a suspended account', () => {
  it('replaces the composer with the notice', () => {
    renderChatRoom({ [PEER]: { suspended: true, checkedAt: Date.now() } });
    expect(screen.getByTestId(SuspendedPeerTestIds.notice)).toHaveTextContent(
      "This account is suspended. You can't message or call it."
    );
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('keeps the composer when the partner is not suspended', () => {
    renderChatRoom({ [PEER]: { suspended: false, checkedAt: Date.now() } });
    expect(screen.queryByTestId(SuspendedPeerTestIds.notice)).toBeNull();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});
