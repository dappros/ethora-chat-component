import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import ChatRoom from './ChatRoom';

// ChatRoom reads the xmpp client via context. `xmppClientMock` is mutated
// per-test so the same mock module can stand in for every combination of
// client / providerBootstrapStatus / initMode the cold-start bug spans -
// see the CLIENT_STATES/INIT_MODES table below.
//
// A present client is a Proxy rather than a plain `{ status }` object:
// with activeRoomJID null (every scenario here), useRoomInitialization
// still calls `client.setActiveRoomJid(null)` on mount, and ChatRoom's own
// unmount effect calls `client.actionSetTimestampToPrivateStoreStanza(...)`
// - a plain object without those methods throws. The Proxy answers any
// method call with a no-op instead of enumerating every method these
// effects might reach for.
const makeMockClient = (status: string) =>
  new Proxy({ status } as Record<string, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return (..._args: unknown[]) => undefined;
    },
  }) as unknown as { status: string };

const xmppClientMock: {
  client: { status: string } | null;
  providerBootstrapStatus: 'idle' | 'running' | 'ready' | 'failed';
  initMode: 'provider' | 'chat';
} = {
  client: null,
  providerBootstrapStatus: 'idle',
  initMode: 'chat',
};

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => xmppClientMock,
}));
vi.mock('../../context/xmppProvider.tsx', () => ({
  useXmppClient: () => xmppClientMock,
}));

// The join itself is covered in useRoomInitialization.joinByLink.test; here
// the flag is preloaded, so the hook is stubbed to keep it from racing it.
vi.mock('../../hooks/useRoomInitialization.tsx', () => ({
  useRoomInitialization: () => undefined,
}));
vi.mock('../../hooks/useRoomInitialization', () => ({
  useRoomInitialization: () => undefined,
}));

const baseUser = {
  xmppUsername: 'me_1234@example.com',
  firstName: 'Me',
  lastName: 'User',
};

// Mirrors the real initialState shape (minus the fields under test, set per
// scenario below) - same approach ChatRoom.openState.test.tsx uses.
const emptyRoomsState = (overrides: Record<string, unknown> = {}) => ({
  rooms: {},
  activeRoomJID: null,
  isChatUiVisible: true,
  editAction: { isEdit: false, roomJid: '', messageId: '', text: '' },
  isLoading: false,
  usersSet: {},
  presenceByRoom: {},
  reportRoom: { isOpen: false },
  subscribedRooms: [],
  pushSubscriptionStatus: {},
  loadingText: undefined,
  drafts: {},
  roomsLoadedOnce: false,
  roomsLoadError: false,
  ...overrides,
});

const OTHER = 'app1_other@conference.example.com';
const WANTED = 'app1_wanted@conference.example.com';
const UNAVAILABLE = /isn't available/i;

const renderChatRoom = (roomsOverrides: Record<string, unknown> = {}) =>
  renderWithProviders(<ChatRoom />, {
    preloadedState: {
      chatSettingStore: { user: baseUser, config: { disableHeader: true } } as any,
      rooms: emptyRoomsState({
        rooms: { [OTHER]: { jid: OTHER, name: 'Other', messages: [] } },
        activeRoomJID: WANTED,
        roomsLoadedOnce: true,
        roomsLoadError: false,
        ...roomsOverrides,
      }) as any,
    },
  });

// Joining a public chat (shared link, Discover "Join"): the server registers
// the membership a moment after our presence, so for 2-3s the requested room
// is "not in the list" although the user just asked to join it. That window
// used to render the "This chat isn't available" screen.
describe('ChatRoom while joining a room that is not in the list yet', () => {
  beforeEach(() => {
    xmppClientMock.client = makeMockClient('online');
    xmppClientMock.providerBootstrapStatus = 'ready';
    xmppClientMock.initMode = 'chat';
  });

  it('control: without a join in flight the unavailable screen shows', () => {
    const { container } = renderChatRoom();
    expect(container.textContent || '').toMatch(UNAVAILABLE);
    expect(screen.queryByTestId('chat-room-joining-loader')).toBeNull();
  });

  it('shows a loader, not the unavailable screen, while the join is in flight', () => {
    const { container } = renderChatRoom({ joiningRoomJID: WANTED });
    expect(screen.getByTestId('chat-room-joining-loader')).toBeTruthy();
    expect(container.textContent || '').not.toMatch(UNAVAILABLE);
  });

  it('ignores a join flag that names a different room', () => {
    const { container } = renderChatRoom({ joiningRoomJID: OTHER });
    expect(screen.queryByTestId('chat-room-joining-loader')).toBeNull();
    expect(container.textContent || '').toMatch(UNAVAILABLE);
  });
});
