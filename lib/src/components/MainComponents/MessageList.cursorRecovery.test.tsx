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
  room: Record<string, any> = {}
) => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => 300,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 800,
  });
  const storeRef = { current: null as any };
  renderWithProviders(
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
              historyComplete: false,
              messageStats: { firstMessageTimestamp: 900_000 },
              ...room,
            },
          },
          activeRoomJID: ROOM_JID,
          isChatUiVisible: true,
          editAction: { isEdit: false },
          isLoading: false,
          loadingText: '',
          usersSet: {},
        } as any,
      },
    }
  );
  return storeRef;
};

const run = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const setCursor = (storeRef: any, cursor: number) =>
  act(async () => {
    storeRef.current.dispatch(
      updateRoom({
        jid: ROOM_JID,
        updates: { messageStats: { firstMessageTimestamp: cursor } as any },
      })
    );
  });

describe('MessageList - paging guard recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (HTMLElement.prototype as any).scrollHeight;
    delete (HTMLElement.prototype as any).clientHeight;
  });

  it('retries a stuck request exactly once, with a delay, then stops (no busy loop)', async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    setup(loadMore);
    await run(500);
    expect(loadMore).toHaveBeenCalledTimes(1);
    await run(600);
    expect(loadMore).toHaveBeenCalledTimes(2);
    await run(10_000);
    expect(loadMore).toHaveBeenCalledTimes(2);
  });

  it('allows the same key again after the cursor moved and regressed', async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    const storeRef = setup(loadMore);
    await run(3000);
    expect(loadMore).toHaveBeenCalledTimes(2);

    // The cursor moves on, then a late answer sets it back to the old value.
    await setCursor(storeRef, 800_000);
    await run(3000);
    const afterMove = loadMore.mock.calls.length;
    expect(afterMove).toBeGreaterThan(2);
    await setCursor(storeRef, 900_000);
    await run(3000);
    expect(loadMore.mock.calls.length).toBeGreaterThan(afterMove);
    expect(loadMore.mock.calls[loadMore.mock.calls.length - 1][2]).toBe(900_000);
  });

  it('historyComplete stops it, including a pending retry', async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    const storeRef = setup(loadMore);
    await run(500);
    expect(loadMore).toHaveBeenCalledTimes(1);
    await act(async () => {
      storeRef.current.dispatch(
        updateRoom({ jid: ROOM_JID, updates: { historyComplete: true } })
      );
    });
    await run(10_000);
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('a short complete room does nothing', async () => {
    const loadMore = vi.fn().mockResolvedValue(undefined);
    setup(loadMore, { historyComplete: true });
    await run(10_000);
    expect(loadMore).not.toHaveBeenCalled();
  });
});
