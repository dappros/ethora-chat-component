import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setRoomMessages } from '../../roomStore/roomsSlice';
import MessageList from './MessageList';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null }),
}));

const ROOM_JID = 'room1@conference.example.com';
const SELF = 'me_1234@example.com';
const PEER = 'peer_5678@example.com';

const makeMessages = () => [
  {
    id: 'old-1',
    body: 'hi',
    date: new Date(Date.now() - 20000).toISOString(),
    roomJid: ROOM_JID,
    user: { id: PEER, name: 'Peer' },
  },
  {
    id: 'old-2',
    body: 'test',
    date: new Date(Date.now() - 10000).toISOString(),
    roomJid: ROOM_JID,
    user: { id: SELF, name: 'Me' },
  },
];

const renderList = (loadMoreMessages: (...args: any[]) => Promise<void>) => {
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
              messages: makeMessages(),
              composingList: [],
              lastViewedTimestamp: Date.now(),
              unreadBaselineTimestamp: 0,
              unreadMessages: 0,
              historyPreloadState: 'done',
              historyComplete: false,
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
  return { ...utils, storeRef };
};

// Reported bug (video): a short conversation that doesn't fill the
// viewport never scrolls far enough for scrollTop to leave the "near top"
// zone checkIfLoadMoreMessages gates on - jsdom's default scrollTop=0
// reproduces exactly that. Root cause confirmed live: 245+ real
// getHistoryStanza round trips in ~11s (~340ms apart, matching real
// network latency each time, not a same-tick loop) because every scroll
// tick re-satisfied the trigger and nothing locally distinguished "still
// loading the same page" from "already tried this page, got nothing new".
describe('MessageList - load-more does not busy-loop on a short conversation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requests the same oldest message only once, even across many scroll ticks', async () => {
    const loadMoreMessages = vi.fn().mockResolvedValue(undefined);
    const { container } = renderList(loadMoreMessages);

    const outer = container.querySelector('[class*="Outer"]') || container.firstChild;
    const scrollTarget = (outer as HTMLElement) ?? document;

    // Simulate the scroll storm from the video: many scroll events in
    // quick succession (smooth-scroll-to-bottom fires several as it
    // animates, and each one runs the 50ms-debounced check).
    for (let i = 0; i < 10; i++) {
      fireEvent.scroll(scrollTarget as Element, {});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });
    }

    // Same oldest message id every time (nothing new ever arrived) -
    // must only have been requested once, not once per scroll tick.
    expect(loadMoreMessages).toHaveBeenCalledTimes(1);
  });

  it('allows a new request once the oldest message actually changes (real pagination still works)', async () => {
    const loadMoreMessages = vi.fn().mockResolvedValue(undefined);
    const { container, storeRef } = renderList(loadMoreMessages);

    const outer = container.querySelector('[class*="Outer"]') || container.firstChild;
    const scrollTarget = (outer as HTMLElement) ?? document;

    fireEvent.scroll(scrollTarget as Element, {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(loadMoreMessages).toHaveBeenCalledTimes(1);

    // A genuine older page arrived - the oldest message id is now different.
    await act(async () => {
      storeRef.current.dispatch(
        setRoomMessages({
          roomJID: ROOM_JID,
          messages: [
            {
              id: 'even-older-1',
              body: 'older',
              date: new Date(Date.now() - 30000).toISOString(),
              roomJid: ROOM_JID,
              user: { id: PEER, name: 'Peer' },
            } as any,
            ...makeMessages(),
          ],
        })
      );
    });

    fireEvent.scroll(scrollTarget as Element, {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(loadMoreMessages).toHaveBeenCalledTimes(2);
  });
});
