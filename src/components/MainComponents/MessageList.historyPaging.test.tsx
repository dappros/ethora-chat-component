import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import MessageList from './MessageList';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null }),
}));

const ROOM_JID = 'room1@conference.example.com';
const SELF = 'me_1234@example.com';
const PEER = 'peer_5678@example.com';

// Numeric ids (ms timestamps) because the paging cursor is derived from them.
const makeMessages = () => [
  {
    id: '2000000',
    body: 'hi',
    date: new Date(2000000).toISOString(),
    roomJid: ROOM_JID,
    user: { id: PEER, name: 'Peer' },
  },
  {
    id: '3000000',
    body: 'test',
    date: new Date(3000000).toISOString(),
    roomJid: ROOM_JID,
    user: { id: SELF, name: 'Me' },
  },
];

const renderList = (
  loadMoreMessages: (...args: any[]) => Promise<void>,
  opts: { loading?: boolean; messageStats?: any } = {}
) =>
  renderWithProviders(
    <MessageList
      roomJID={ROOM_JID}
      user={{ xmppUsername: SELF } as any}
      loadMoreMessages={loadMoreMessages}
      loading={opts.loading ?? false}
      config={{}}
      isReply={false}
    />,
    {
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
              messageStats: opts.messageStats,
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

// The scrollable pane is the element the component reads scrollTop from; the
// outer wrapper listens for its (capturing) scroll events.
const findScroller = (container: HTMLElement): HTMLElement => {
  const outer = container.firstElementChild as HTMLElement;
  const scroller = Array.from(outer.children).find(
    (el) => el.querySelector('[data-message-id]') !== null
  ) as HTMLElement | undefined;
  if (!scroller) throw new Error('scroll pane not found');
  return scroller;
};

const scrollTo = async (el: HTMLElement, top: number) => {
  // jsdom ignores writes to scrollTop, so pin the value the component reads.
  // The component writes scrollTop itself (stick to bottom) and jsdom has
  // no layout, so those writes are swallowed to keep the pinned position.
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: () => {},
  });
  fireEvent.scroll(el);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60);
  });
};

describe('MessageList history loader overlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  it('stays hidden while loading if the reader is far from the top', async () => {
    const { container } = renderList(vi.fn().mockResolvedValue(undefined), {
      loading: true,
    });
    const scroller = findScroller(container);

    await scrollTo(scroller, 5000);

    expect(screen.queryByTestId('history-loader')).toBeNull();
  });

  it('shows once loading and the reader is within 80px of the top', async () => {
    const { container } = renderList(vi.fn().mockResolvedValue(undefined), {
      loading: true,
    });
    const scroller = findScroller(container);

    await scrollTo(scroller, 5000);
    expect(screen.queryByTestId('history-loader')).toBeNull();

    await scrollTo(scroller, 40);
    expect(screen.getByTestId('history-loader')).toBeTruthy();
  });

  it('stays hidden near the top when nothing is loading', async () => {
    const { container } = renderList(vi.fn().mockResolvedValue(undefined), {
      loading: false,
    });
    const scroller = findScroller(container);

    await scrollTo(scroller, 10);

    expect(screen.queryByTestId('history-loader')).toBeNull();
  });
});

describe('MessageList history paging cursor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  it('pages from the server cursor when it is older than the oldest displayed id', async () => {
    const loadMoreMessages = vi.fn().mockResolvedValue(undefined);
    const { container } = renderList(loadMoreMessages, {
      messageStats: { firstMessageTimestamp: 1500000 },
    });

    await scrollTo(findScroller(container), 0);

    expect(loadMoreMessages).toHaveBeenCalledTimes(1);
    expect(loadMoreMessages).toHaveBeenCalledWith(ROOM_JID, 100, 1500000);
  });

  it('falls back to the oldest displayed id when the cursor is not older', async () => {
    const loadMoreMessages = vi.fn().mockResolvedValue(undefined);
    const { container } = renderList(loadMoreMessages, {
      messageStats: { firstMessageTimestamp: 2500000 },
    });

    await scrollTo(findScroller(container), 0);

    expect(loadMoreMessages).toHaveBeenCalledWith(ROOM_JID, 100, 2000000);
  });

  it('falls back to the oldest displayed id when there is no cursor', async () => {
    const loadMoreMessages = vi.fn().mockResolvedValue(undefined);
    const { container } = renderList(loadMoreMessages);

    await scrollTo(findScroller(container), 0);

    expect(loadMoreMessages).toHaveBeenCalledWith(ROOM_JID, 100, 2000000);
  });
});
