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

const NO_ROOM_CTA = "No room. Let's create one!";
const LOAD_FAILED_MESSAGE = "Couldn't load your chats. Retrying...";

const renderChatRoom = (roomsOverrides: Record<string, unknown> = {}) =>
  renderWithProviders(<ChatRoom />, {
    preloadedState: {
      chatSettingStore: { user: baseUser, config: { disableHeader: true } } as any,
      rooms: emptyRoomsState(roomsOverrides) as any,
    },
  });

describe('ChatRoom "No room" CTA - cold start (roomsLoadedOnce)', () => {
  beforeEach(() => {
    xmppClientMock.client = null;
    xmppClientMock.providerBootstrapStatus = 'idle';
    xmppClientMock.initMode = 'chat';
  });

  // The bug: on a first login with an empty persisted store, the CTA used
  // to flash before the room list ever resolved. It depended on THREE
  // negative signals (not loading, a client that reads "online", provider
  // not mid-bootstrap) which all read as "fine" in the gap right after
  // mount - before any of them had a reason to say otherwise. Every
  // combination below reproduces a piece of that gap; none may show the
  // CTA while roomsLoadedOnce is still false.
  const coldStartCases: Array<{
    name: string;
    client: { status: string } | null;
    initMode: 'provider' | 'chat';
    providerBootstrapStatus: 'idle' | 'running' | 'ready' | 'failed';
  }> = [
    {
      name: 'initBeforeLoad=false (initMode "chat"), no client yet',
      client: null,
      initMode: 'chat',
      providerBootstrapStatus: 'idle',
    },
    {
      name: 'initBeforeLoad=false (initMode "chat"), client connecting',
      client: makeMockClient('connecting'),
      initMode: 'chat',
      providerBootstrapStatus: 'idle',
    },
    {
      name: 'initBeforeLoad=true (initMode "provider"), no client yet',
      client: null,
      initMode: 'provider',
      providerBootstrapStatus: 'running',
    },
    {
      name: 'initBeforeLoad=true (initMode "provider"), client connecting',
      client: makeMockClient('connecting'),
      initMode: 'provider',
      providerBootstrapStatus: 'running',
    },
  ];

  it.each(coldStartCases)(
    'shows no CTA before the fetch resolves - $name',
    ({ client, initMode, providerBootstrapStatus }) => {
      xmppClientMock.client = client;
      xmppClientMock.initMode = initMode;
      xmppClientMock.providerBootstrapStatus = providerBootstrapStatus;

      renderChatRoom(); // roomsLoadedOnce: false (default), rooms: {}

      expect(screen.queryByText(NO_ROOM_CTA)).toBeNull();
      expect(screen.queryByText(LOAD_FAILED_MESSAGE)).toBeNull();
    }
  );

  it('still shows no CTA even if loading/globalLoading happen to read false at mount (hole 1)', () => {
    // This is the exact gap the bug lived in: isLoading defaults to false
    // and nothing has dispatched "loading: true" yet. Without the
    // roomsLoadedOnce gate this alone used to be enough to show the CTA.
    xmppClientMock.client = null;
    xmppClientMock.initMode = 'chat';

    renderChatRoom({ isLoading: false, roomsLoadedOnce: false });

    expect(screen.queryByText(NO_ROOM_CTA)).toBeNull();
  });

  it('gets the CTA promptly once a genuinely empty account has resolved', () => {
    xmppClientMock.client = makeMockClient('online');
    xmppClientMock.initMode = 'chat';
    xmppClientMock.providerBootstrapStatus = 'ready';

    renderChatRoom({ roomsLoadedOnce: true, roomsLoadError: false });

    expect(screen.getByText(NO_ROOM_CTA)).toBeTruthy();
    expect(screen.queryByText(LOAD_FAILED_MESSAGE)).toBeNull();
  });

  it('shows a retry message, not the "no rooms" CTA, when the fetch resolved with a failure', () => {
    xmppClientMock.client = makeMockClient('online');
    xmppClientMock.initMode = 'chat';
    xmppClientMock.providerBootstrapStatus = 'ready';

    renderChatRoom({ roomsLoadedOnce: true, roomsLoadError: true });

    expect(screen.getByText(LOAD_FAILED_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(NO_ROOM_CTA)).toBeNull();
  });

  it('a null client reads as "not ready", not "online" (hole 2)', () => {
    // Even with roomsLoadedOnce true and a genuinely empty account, a null
    // client must not be mistaken for "XMPP is fine" - the old
    // `!!client && ...` guard read a null client as already online.
    xmppClientMock.client = null;
    xmppClientMock.initMode = 'chat';
    xmppClientMock.providerBootstrapStatus = 'idle';

    renderChatRoom({ roomsLoadedOnce: true, roomsLoadError: false });

    expect(screen.queryByText(NO_ROOM_CTA)).toBeNull();
  });

  // The first attempt at this bug gated only the "no rooms, create one" CTA,
  // which simply handed the same window over to the idle "choose a chat"
  // illustration below it in the render chain. Neither may appear before the
  // room list has actually come back.
  it('shows neither empty state while the room list is still unresolved', () => {
    const { container } = renderChatRoom({
      rooms: {},
      roomsLoadedOnce: false,
      roomsLoadError: false,
    });

    const text = container.textContent || '';
    expect(text).not.toMatch(/create one/i);
    expect(text).not.toMatch(/Choose a chat|Start a Conversation/i);
  });
});

// Regression, found live in ethora-app-reactjs: /chats/my can take 20s and
// time out. The fetch then latched "resolved" WITH an error, which opened
// the loader gate (`!roomsLoadedOnce` was false) and dropped the user on
// the idle "Choose a chat to start messaging" placeholder while a retry was
// still in flight. With zero rooms that placeholder is never the truth.
describe('ChatRoom with a failed rooms fetch', () => {
  it('shows the retry state, never the idle choose-a-chat placeholder', () => {
    const { container } = renderChatRoom({
      rooms: {},
      roomsLoadedOnce: true,
      roomsLoadError: true,
      // Still "loading" as far as the init flow is concerned, which is what
      // made roomsResolvedWithError false and let the old chain fall
      // through to the placeholder.
      isLoading: true,
    });

    const text = container.textContent || '';
    expect(text).toMatch(/Couldn't load your chats/i);
    expect(text).not.toMatch(/Choose a chat|Start a Conversation/i);
    expect(text).not.toMatch(/create one/i);
  });
});
