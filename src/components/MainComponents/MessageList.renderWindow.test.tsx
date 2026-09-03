import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import MessageList from './MessageList';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null }),
}));

const ROOM_JID = 'room1@conference.example.com';
const SELF = 'me_1234@example.com';
const PEER = 'peer_5678@example.com';

const bodyToken = (i: number) => `msgtok_${i}_end`;

const makeManyMessages = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `msg-${String(i).padStart(4, '0')}`,
    body: bodyToken(i),
    date: new Date(Date.now() - (count - i) * 10000).toISOString(),
    roomJid: ROOM_JID,
    user: { id: i % 2 ? SELF : PEER, name: i % 2 ? 'Me' : 'Peer' },
  }));

const renderList = (messageCount: number) => {
  const loadMoreMessages = vi.fn().mockResolvedValue(undefined);
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
      preloadedState: {
        chatSettingStore: { user: { xmppUsername: SELF }, config: {} } as any,
        rooms: {
          rooms: {
            [ROOM_JID]: {
              jid: ROOM_JID,
              messages: makeManyMessages(messageCount),
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
  return { ...utils, loadMoreMessages };
};

// Message rows don't expose a stable DOM attribute, so count which unique
// bodies actually made it into the document.
const countRenderedMessages = (container: HTMLElement, total: number) => {
  const text = container.textContent || '';
  let rendered = 0;
  for (let i = 0; i < total; i++) {
    if (text.includes(bodyToken(i))) rendered++;
  }
  return rendered;
};

describe('MessageList - windowed rendering bounds the DOM', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts only the newest window of a long transcript', () => {
    const { container } = renderList(400);
    const rendered = countRenderedMessages(container, 400);
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThanOrEqual(120);
  });

  it('renders everything when the transcript fits the window', () => {
    const { container } = renderList(40);
    expect(countRenderedMessages(container, 40)).toBe(40);
  });

  it('widens the window on scroll-to-top instead of asking the server', async () => {
    const { container, loadMoreMessages } = renderList(400);
    const before = countRenderedMessages(container, 400);

    const outer =
      container.querySelector('[class*="Outer"]') || container.firstChild;
    // jsdom's scrollTop stays 0, which is exactly the "near top" zone the
    // load-more gate reacts to.
    fireEvent.scroll(outer as Element, {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(countRenderedMessages(container, 400)).toBeGreaterThan(before);
    // Older messages exist locally, so no server round trip yet.
    expect(loadMoreMessages).not.toHaveBeenCalled();
  });
});
