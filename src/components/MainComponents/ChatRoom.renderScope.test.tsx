import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import ChatRoom from './ChatRoom';
import { Message } from '../MessageBubble/Message';
import {
  setComposing,
  setDisplayedMarker,
  setReceivedWatermark,
  updateRoom,
} from '../../roomStore/roomsSlice';
import { IMessage, IRoom } from '../../types/types';

// Render scope of ChatRoom and its header. ChatHeader is wrapped (it still
// renders for real) so its render count is visible. ChatHeader is not memoised
// and is rendered by ChatRoom directly, so its count tracks ChatRoom renders
// while the header is shown.

const counters = vi.hoisted(() => ({ header: 0 }));
vi.mock('./ChatHeader.tsx', async (importOriginal) => {
  const mod: any = await importOriginal();
  const Real = mod.default;
  return {
    default: (props: any) => {
      counters.header += 1;
      return <Real {...props} />;
    },
  };
});

const xmpp = vi.hoisted(() => ({
  client: {
    status: 'online',
    actionSetTimestampToPrivateStoreStanza: vi.fn(),
    sendDisplayedMarkerStanza: vi.fn(),
    setActiveRoomJid: vi.fn(),
    promoteRoomHistory: vi.fn(),
    getHistoryStanza: vi.fn(async () => []),
    getRoomInfoStanza: vi.fn(),
    presenceInRoomStanza: vi.fn(async () => true),
    prioritizeRoomPresence: vi.fn(async () => true),
  },
}));
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: xmpp.client,
    providerBootstrapStatus: 'ready',
    initMode: 'chat',
  }),
}));
vi.mock('../../context/xmppProvider.tsx', () => ({
  useXmppClient: () => ({
    client: xmpp.client,
    providerBootstrapStatus: 'ready',
    initMode: 'chat',
  }),
}));
// The history/join effects are covered by their own tests.
vi.mock('../../hooks/useRoomInitialization.tsx', () => ({
  useRoomInitialization: () => undefined,
}));
vi.mock('../../hooks/useRoomInitialization', () => ({
  useRoomInitialization: () => undefined,
}));

const ROOM = 'room1@conference.example.com';
const OTHER = 'room2@conference.example.com';
const SELF = 'me_0000@example.com';
const PEER = 'peer_0001@example.com';
const BASE = Date.UTC(2026, 0, 1, 9, 0, 0);
const CONFIG: any = { disableHeader: false };

const makeMessages = (roomJID: string, count: number): IMessage[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${roomJID.split('@')[0]}-m${i}`,
    body: `message ${i}`,
    date: new Date(BASE + i * 60_000).toISOString(),
    roomJid: roomJID,
    xmppId: `x-${roomJID}-${i}`,
    user: i % 2 === 0 ? { id: SELF, name: 'Me' } : { id: PEER, name: 'Peer' },
  }) as unknown as IMessage);

const makeRoom = (roomJID: string, messages: IMessage[], extra: Partial<IRoom> = {}): IRoom =>
  ({
    jid: roomJID,
    name: roomJID.split('@')[0],
    title: `Title ${roomJID.split('@')[0]}`,
    type: 'group',
    messages,
    members: [{ xmppUsername: SELF }, { xmppUsername: PEER }],
    usersCnt: 2,
    composing: false,
    composingList: [],
    lastViewedTimestamp: 0,
    unreadBaselineTimestamp: 0,
    unreadMessages: 0,
    historyPreloadState: 'done',
    historyComplete: true,
    lastReceivedByUser: {},
    lastDisplayedByUser: {},
    isLoading: false,
    ...extra,
  }) as unknown as IRoom;

function setup() {
  const storeRef = { current: null as any };
  const utils = renderWithProviders(
    <ChatRoom CustomMessageComponent={Message as any} />,
    {
      storeRef,
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: SELF, firstName: 'Me', lastName: 'Self' },
          config: CONFIG,
        } as any,
        rooms: {
          rooms: {
            [ROOM]: makeRoom(ROOM, makeMessages(ROOM, 20)),
            [OTHER]: makeRoom(OTHER, makeMessages(OTHER, 20)),
          },
          activeRoomJID: ROOM,
          isChatUiVisible: true,
          editAction: { isEdit: false },
          isLoading: false,
          loadingText: '',
          usersSet: {},
          presenceByRoom: {},
          roomsLoadedOnce: true,
          roomsLoadError: false,
          joiningRoomJID: null,
          drafts: {},
        } as any,
      },
    }
  );
  return { ...utils, store: storeRef };
}

// Timers armed on mount or by a store update (the chat-open settle at 220 ms,
// the mark-read debounce at 1 s, the history auto-load checks, the draft save)
// run on fake timers, so they fire only when a test advances the clock. A
// real timer could otherwise land inside the measurement window on a slow
// runner and add a render the update did not cause.
const SETTLE_WINDOW_MS = 5_000;
const MAX_SETTLE_PASSES = 8;

// Advances the fake clock in full windows until two consecutive samples of
// the render counters are equal, so nothing armed before the call can still
// fire inside the next measurement.
async function settle(sample: () => unknown) {
  let previous: string | undefined;
  for (let pass = 0; pass < MAX_SETTLE_PASSES; pass += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SETTLE_WINDOW_MS);
    });
    const current = JSON.stringify(sample());
    if (current === previous) return;
    previous = current;
  }
  throw new Error(`render counters did not settle within ${MAX_SETTLE_PASSES} windows`);
}

// Runs one store update and reports how many ChatRoom (header) renders it caused.
// Each call settles first, so the baseline is taken with nothing still pending.
async function headerRendersFor(update: () => void) {
  await settle(() => counters.header);
  counters.header = 0;
  await act(async () => {
    update();
  });
  await settle(() => counters.header);
  return counters.header;
}

describe('ChatRoom render scope', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    counters.header = 0;
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('(g) does not re-render for receipt, marker or composing updates in other rooms', async () => {
    const { store } = setup();
    expect(counters.header).toBeGreaterThan(0);

    const watermark = await headerRendersFor(() =>
      store.current.dispatch(
        setReceivedWatermark({ roomJID: OTHER, xmppUsername: PEER, messageId: 'room2-m5' })
      )
    );
    const marker = await headerRendersFor(() =>
      store.current.dispatch(
        setDisplayedMarker({ roomJID: OTHER, xmppUsername: PEER, messageId: 'room2-m5' })
      )
    );
    const composing = await headerRendersFor(() =>
      store.current.dispatch(
        setComposing({ chatJID: OTHER, composing: true, composingList: [PEER] })
      )
    );
    expect(watermark).toBe(0);
    expect(marker).toBe(0);
    expect(composing).toBe(0);
  });

  it('(e) header follows its own title/usersCnt, not unrelated room messages or the active room watermark', async () => {
    const { store } = setup();

    const unrelatedMessage = await headerRendersFor(() =>
      store.current.dispatch(
        updateRoom({ jid: OTHER, updates: { title: 'Other renamed' } })
      )
    );
    const ownWatermark = await headerRendersFor(() =>
      store.current.dispatch(
        setReceivedWatermark({ roomJID: ROOM, xmppUsername: PEER, messageId: `${ROOM.split('@')[0]}-m3` })
      )
    );
    const title = await headerRendersFor(() =>
      store.current.dispatch(updateRoom({ jid: ROOM, updates: { title: 'Fresh title' } }))
    );
    expect(screen.getByText('Fresh title')).toBeTruthy();

    const count = await headerRendersFor(() =>
      store.current.dispatch(updateRoom({ jid: ROOM, updates: { usersCnt: 7 } }))
    );
    expect(unrelatedMessage).toBe(0);
    expect(ownWatermark).toBe(0);
    expect(title).toBeGreaterThan(0);
    expect(count).toBeGreaterThan(0);
  });

  it('(f) the composing summary still updates the header', async () => {
    const { store } = setup();
    const renders = await headerRendersFor(() =>
      store.current.dispatch(
        setComposing({ chatJID: ROOM, composing: true, composingList: [PEER] })
      )
    );
    expect(renders).toBeGreaterThan(0);
    expect(store.current.getState().rooms.rooms[ROOM].composingList).toEqual([PEER]);
  });
});
