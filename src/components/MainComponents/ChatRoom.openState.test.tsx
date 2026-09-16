import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import {
  addRoomMessage,
  setCurrentRoom,
  setIsLoading,
} from '../../roomStore/roomsSlice';
import ChatRoom from './ChatRoom';
import { IRoom } from '../../types/types';

// ChatRoom reads the xmpp client via context. With `client: undefined`
// every client-gated branch in useRoomInitialization/useSendMessage/
// useComposing short-circuits, so the component renders exactly what the
// redux state says without ever touching the network - which is all this
// suite cares about (the pane's open-state machine, not XMPP wiring).
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: undefined,
    providerBootstrapStatus: 'ready',
    initMode: 'chat',
  }),
}));
vi.mock('../../context/xmppProvider.tsx', () => ({
  useXmppClient: () => ({
    client: undefined,
    providerBootstrapStatus: 'ready',
    initMode: 'chat',
  }),
}));

const ROOM_A = 'room-a@conference.example.com';
const ROOM_B = 'room-b@conference.example.com';
const SELF = 'me_1234@example.com';
const PEER = 'peer_5678@example.com';

const baseUser = {
  xmppUsername: SELF,
  firstName: 'Me',
  lastName: 'User',
};

const makeRoom = (overrides: Partial<IRoom>): IRoom =>
  ({
    jid: overrides.jid as string,
    name: 'Room',
    title: 'Room',
    usersCnt: 2,
    messages: [],
    isLoading: false,
    roomBg: null,
    historyPreloadState: 'idle',
    ...overrides,
  }) as IRoom;

const baseRoomsState = (rooms: Record<string, IRoom>, activeRoomJID: string) => ({
  rooms,
  activeRoomJID,
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
});

describe('ChatRoom open-state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not flicker back to the empty placeholder while history is loading, then settles on messages', async () => {
    const storeRef = { current: null as any };
    renderWithProviders(<ChatRoom />, {
      storeRef,
      preloadedState: {
        chatSettingStore: { user: baseUser, config: { disableHeader: true } } as any,
        rooms: baseRoomsState(
          { [ROOM_A]: makeRoom({ jid: ROOM_A, historyPreloadState: 'idle' }) },
          ROOM_A
        ) as any,
      },
    });

    // First paint: still within the settle debounce window, so it must
    // read as "opening" (loader), never the empty placeholder - even
    // though none of the loading flags have gone true yet.
    expect(screen.getByTestId('chat-room-opening-loader')).toBeTruthy();
    expect(screen.queryByText('This chat is empty')).toBeNull();

    // Simulate the flapping loading flags a real room-open goes through:
    // true, false, true, false, each spaced well inside the debounce
    // window, before messages finally land. None of these dips may ever
    // reach the DOM as the empty placeholder.
    const pulses = [true, false, true, false];
    for (const loading of pulses) {
      await act(async () => {
        storeRef.current.dispatch(setIsLoading({ loading, chatJID: ROOM_A }));
        vi.advanceTimersByTime(80);
      });
      expect(screen.queryByText('This chat is empty')).toBeNull();
      // Never regresses to the empty state mid-sequence.
    }

    // Let the last (false) reading hold past the debounce - only now is
    // "not loading" trusted, and only if hasMessages is still false would
    // this become the empty placeholder. Here a message arrives first.
    await act(async () => {
      storeRef.current.dispatch(
        addRoomMessage({
          roomJID: ROOM_A,
          message: {
            id: 'm1',
            xmppId: 'm1',
            roomJid: ROOM_A,
            body: 'hello',
            date: new Date().toISOString(),
            user: { id: PEER, name: 'Peer' },
          } as any,
        })
      );
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.queryByTestId('chat-room-opening-loader')).toBeNull();
    expect(screen.queryByText('This chat is empty')).toBeNull();
  });

  it('renders the seeded last message with a loader while a room with no history is opening', async () => {
    const storeRef = { current: null as any };
    renderWithProviders(<ChatRoom />, {
      storeRef,
      preloadedState: {
        chatSettingStore: { user: baseUser, config: { disableHeader: true } } as any,
        rooms: baseRoomsState(
          {
            [ROOM_A]: makeRoom({
              jid: ROOM_A,
              historyPreloadState: 'loading',
              lastMessage: {
                id: 'seed-1',
                xmppId: 'seed-stanza-1',
                roomJid: ROOM_A,
                body: 'g23f',
                date: new Date().toISOString(),
                user: { id: PEER, name: 'Peer' },
              } as any,
            }),
          },
          ROOM_A
        ) as any,
      },
    });

    expect(screen.getByTestId('chat-room-opening-seed')).toBeTruthy();
    expect(screen.getByText('g23f')).toBeTruthy();
    expect(screen.getByTestId('chat-room-opening-loader')).toBeTruthy();
    expect(screen.queryByText('This chat is empty')).toBeNull();
  });

  it('does not duplicate the seeded message once the real one arrives with the same identity', async () => {
    const storeRef = { current: null as any };
    renderWithProviders(<ChatRoom />, {
      storeRef,
      preloadedState: {
        chatSettingStore: { user: baseUser, config: { disableHeader: true } } as any,
        rooms: baseRoomsState(
          {
            [ROOM_A]: makeRoom({
              jid: ROOM_A,
              historyPreloadState: 'loading',
              lastMessage: {
                id: 'seed-1',
                xmppId: 'seed-stanza-1',
                roomJid: ROOM_A,
                body: 'g23f',
                date: new Date().toISOString(),
                user: { id: PEER, name: 'Peer' },
              } as any,
            }),
          },
          ROOM_A
        ) as any,
      },
    });

    expect(screen.getAllByText('g23f')).toHaveLength(1);

    // MAM returns the same message for real, matching the seed by id and
    // stanzaId (xmppId) - not by re-typing the same body text, which two
    // unrelated messages could share.
    await act(async () => {
      storeRef.current.dispatch(
        addRoomMessage({
          roomJID: ROOM_A,
          message: {
            id: 'seed-1',
            xmppId: 'seed-stanza-1',
            roomJid: ROOM_A,
            body: 'g23f',
            date: new Date().toISOString(),
            user: { id: PEER, name: 'Peer' },
          } as any,
        })
      );
      vi.advanceTimersByTime(300);
    });

    // Exactly one bubble for this message, ever - never the seed preview
    // plus the real transcript at once.
    expect(screen.getAllByText('g23f')).toHaveLength(1);
    expect(screen.queryByTestId('chat-room-opening-seed')).toBeNull();
  });

  it('shows the existing empty placeholder for a room with no history and no seed', async () => {
    const storeRef = { current: null as any };
    renderWithProviders(<ChatRoom />, {
      storeRef,
      preloadedState: {
        chatSettingStore: { user: baseUser, config: { disableHeader: true } } as any,
        rooms: baseRoomsState(
          {
            [ROOM_A]: makeRoom({
              jid: ROOM_A,
              historyPreloadState: 'done',
              historyComplete: true,
            }),
          },
          ROOM_A
        ) as any,
      },
    });

    // useRoomInitialization dispatches loading:true itself the instant it
    // sees a room with no loaded messages (independent of the seed/history
    // fields set above) and, with no xmpp client in this test to ever
    // resolve that fetch, would otherwise leave it stuck true forever. In
    // real usage that dispatch always eventually flips back to false -
    // either the fetch resolves or useRoomInitialization's own hard-cap
    // timer forces it - so simulate that resolution directly rather than
    // standing up a full client mock just to observe the same outcome.
    await act(async () => {
      storeRef.current.dispatch(setIsLoading({ loading: false, chatJID: ROOM_A }));
      await vi.runAllTimersAsync();
    });
    // The dispatch above lands mid-flight of useRoomInitialization's own
    // mount effect (which had briefly set loading back to true right
    // after this dispatch's first render), so useChatOpenPhase's settle
    // timer isn't actually scheduled until the render that follows - one
    // more flush is what lets that timer's callback run.
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByText('This chat is empty')).toBeTruthy();
    expect(screen.queryByTestId('chat-room-opening-loader')).toBeNull();
  });

  it('resets the open-state latch when the active room switches, even quickly', async () => {
    const storeRef = { current: null as any };
    renderWithProviders(<ChatRoom />, {
      storeRef,
      preloadedState: {
        chatSettingStore: { user: baseUser, config: { disableHeader: true } } as any,
        rooms: baseRoomsState(
          {
            [ROOM_A]: makeRoom({ jid: ROOM_A, historyPreloadState: 'idle' }),
            [ROOM_B]: makeRoom({
              jid: ROOM_B,
              historyPreloadState: 'done',
              historyComplete: true,
              messages: [
                {
                  id: 'b1',
                  xmppId: 'b1',
                  roomJid: ROOM_B,
                  body: 'room b message',
                  date: new Date().toISOString(),
                  user: { id: PEER, name: 'Peer' },
                } as any,
              ],
            }),
          },
          ROOM_A
        ) as any,
      },
    });

    expect(screen.getByTestId('chat-room-opening-loader')).toBeTruthy();

    // Switch to a room that already has messages: must show them right
    // away, not room A's stale opening loader.
    await act(async () => {
      storeRef.current.dispatch(setCurrentRoom({ roomJID: ROOM_B }));
    });
    expect(screen.getByText('room b message')).toBeTruthy();
    expect(screen.queryByTestId('chat-room-opening-loader')).toBeNull();

    // Switch straight back to A (still no messages): the latch must have
    // reset, not carried over any "settled" state room B reached, or any
    // stale timer from room A's first activation.
    await act(async () => {
      storeRef.current.dispatch(setCurrentRoom({ roomJID: ROOM_A }));
    });
    expect(screen.getByTestId('chat-room-opening-loader')).toBeTruthy();
    expect(screen.queryByText('This chat is empty')).toBeNull();
    expect(screen.queryByText('room b message')).toBeNull();
  });
});
