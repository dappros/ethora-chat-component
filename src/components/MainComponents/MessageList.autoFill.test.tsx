import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { updateRoom } from '../../roomStore/roomsSlice';
import MessageList from './MessageList';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null }),
}));

const ROOM_JID = 'room1@conference.example.com';
const SELF = 'me_1234@example.com';
const PEER = 'peer_5678@example.com';

const msg = (id: number) => ({
  id: String(id),
  body: 'm' + id,
  date: new Date(id).toISOString(),
  roomJid: ROOM_JID,
  user: { id: PEER, name: 'Peer' },
});

const setup = (
  loadMoreMessages: (...a: any[]) => Promise<void>,
  extra: { historyComplete?: boolean; rooms?: any } = {}
) => {
  // jsdom has no layout: a viewport that is never filled.
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => 300,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 800,
  });
  const storeRef = { current: null as any };
  const utils = renderWithProviders(
    <MessageList
      roomJID={ROOM_JID}
      user={{ xmppUsername: SELF } as any}
      loadMoreMessages={loadMoreMessages}
      loading={false}
      config={{}}
      isReply={false}
    />,
    {
      storeRef,
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: SELF }, config: {} } as any,
        rooms: {
          rooms: {
            [ROOM_JID]: {
              jid: ROOM_JID,
              messages: [msg(1_000_000)],
              composingList: [],
              lastViewedTimestamp: Date.now(),
              unreadBaselineTimestamp: 0,
              unreadMessages: 0,
              historyPreloadState: 'idle',
              historyComplete: extra.historyComplete ?? false,
            },
          },
          activeRoomJID: ROOM_JID,
          isChatUiVisible: true,
          editAction: { isEdit: false },
          isLoading: false,
          loadingText: '',
          usersSet: {},
          ...(extra.rooms ?? {}),
        } as any,
      },
    }
  );
  return { ...utils, storeRef };
};

const run = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('MessageList - auto-fills a viewport that cannot scroll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (HTMLElement.prototype as any).scrollHeight;
    delete (HTMLElement.prototype as any).clientHeight;
  });

  it('keeps requesting older history with no scroll event while the viewport is unfilled', async () => {
    let cursor = 900_000;
    const ref = { current: null as any };
    const loadMore = vi.fn().mockImplementation(async () => {
      // A page of receipts: nothing displayed, the server cursor moves.
      cursor -= 1000;
      ref.current.dispatch(
        updateRoom({
          jid: ROOM_JID,
          updates: {
            messageStats: { firstMessageTimestamp: cursor } as any,
          },
        })
      );
    });
    const { storeRef } = setup(loadMore);
    ref.current = storeRef.current;
    await run(2000);
    expect(loadMore.mock.calls.length).toBeGreaterThan(5);
  });

  it('stops when history becomes complete', async () => {
    let cursor = 900_000;
    const ref = { current: null as any };
    const loadMore = vi.fn().mockImplementation(async () => {
      cursor -= 1000;
      ref.current.dispatch(
        updateRoom({
          jid: ROOM_JID,
          updates: {
            messageStats: { firstMessageTimestamp: cursor } as any,
            historyComplete: loadMore.mock.calls.length >= 3,
          },
        })
      );
    });
    const { storeRef } = setup(loadMore);
    ref.current = storeRef.current;
    await run(3000);
    expect(loadMore).toHaveBeenCalledTimes(3);
  });

  it('stops at the cap when pages never add messages', async () => {
    let cursor = 900_000;
    const ref = { current: null as any };
    const loadMore = vi.fn().mockImplementation(async () => {
      cursor -= 1000;
      ref.current.dispatch(
        updateRoom({
          jid: ROOM_JID,
          updates: {
            messageStats: { firstMessageTimestamp: cursor } as any,
          },
        })
      );
    });
    const { storeRef } = setup(loadMore);
    ref.current = storeRef.current;
    await run(20000);
    expect(loadMore).toHaveBeenCalledTimes(40);
  });

  it('does nothing when history is complete', async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    setup(loadMore, { historyComplete: true });
    await run(1500);
    expect(loadMore).not.toHaveBeenCalled();
  });

  it('does nothing while a jump to this room is pending', async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    setup(loadMore, {
      rooms: { pendingJump: { roomJID: ROOM_JID, ids: ['x'] } },
    });
    await run(1500);
    expect(loadMore).not.toHaveBeenCalled();
  });

  it('does nothing in window mode', async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    setup(loadMore, {
      rooms: {
        jumpWindow: {
          roomJID: ROOM_JID,
          messages: [msg(500_000)],
          targetId: '500000',
          olderCursor: null,
          hasOlder: false,
          newerCursor: null,
          hasNewer: false,
        },
      },
    });
    await run(1500);
    expect(loadMore).not.toHaveBeenCalled();
  });
});
