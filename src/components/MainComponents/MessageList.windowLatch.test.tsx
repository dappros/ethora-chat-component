import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { replaceRoomMessages } from '../../roomStore/roomsSlice';
import MessageList from './MessageList';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null }),
}));

const ROOM_JID = 'room1@conference.example.com';
const OTHER_JID = 'room2@conference.example.com';
const SELF = 'me_1234@example.com';
const PEER = 'peer_5678@example.com';

const BASE = Date.UTC(2026, 0, 1);
const TOTAL = 400;
// Rows after this index are "unread", so the delimiter is inserted at index 100
// and sits 300 rows from the end - far past the default render window.
const LAST_READ_INDEX = 99;

const tsOf = (i: number) => BASE + i * 10000;
const bodyToken = (i: number) => `msgtok_${i}_end`;

const makeMessages = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `msg-${String(i).padStart(4, '0')}`,
    body: bodyToken(i),
    date: new Date(tsOf(i)).toISOString(),
    roomJid: ROOM_JID,
    user: { id: i % 2 ? SELF : PEER, name: i % 2 ? 'Me' : 'Peer' },
  }));

/**
 * Regression test for the render-window latch.
 *
 * `visibleMessages` widens itself to keep the unread delimiter mounted, so a
 * `renderWindow` bump that lands under that clamp leaves the rendered slice
 * length unchanged. The effect that clears `isExpandingWindowRef` therefore has
 * to depend on `renderWindow`, not just on the slice length - keyed only on the
 * length it never re-runs, the guard latches on at the first top-scroll, and
 * the window can never grow again (nor fall through to the server load-more)
 * until the component remounts.
 */
describe('MessageList - the render-window guard does not latch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps widening the window when the unread delimiter arrives after mount', async () => {
    const loadMoreMessages = vi.fn().mockResolvedValue(undefined);

    // Mount with a short transcript and no delimiter, so the render window
    // initialises at its default (120) instead of at the delimiter's distance.
    const { container, store } = renderWithProviders(
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
                messages: makeMessages(10),
                composingList: [],
                lastViewedTimestamp: tsOf(LAST_READ_INDEX),
                unreadBaselineTimestamp: 0,
                unreadMessages: 0,
                historyPreloadState: 'done',
                historyComplete: false,
              },
            },
            // Not the active room, so `replaceRoomMessages` honours
            // `lastViewedTimestamp` and actually inserts the delimiter.
            activeRoomJID: OTHER_JID,
            isChatUiVisible: true,
            editAction: { isEdit: false },
            isLoading: false,
            loadingText: '',
            usersSet: {},
          } as any,
        },
      }
    );

    await act(async () => {
      store.dispatch(
        replaceRoomMessages({
          roomJID: ROOM_JID,
          messages: makeMessages(TOTAL) as any,
        })
      );
    });

    const countRendered = () => {
      const text = container.textContent || '';
      let n = 0;
      for (let i = 0; i < TOTAL; i++) if (text.includes(bodyToken(i))) n++;
      return n;
    };

    // The delimiter clamp mounts ~310 rows even though `renderWindow` is 120,
    // so the first few window bumps leave the slice length untouched - the
    // exact state that used to latch the guard on for good.
    const clamped = countRendered();
    expect(clamped).toBeGreaterThan(250);
    expect(clamped).toBeLessThan(TOTAL);

    const outer =
      container.querySelector('[class*="Outer"]') || container.firstChild;

    // jsdom keeps scrollTop at 0, which is the "near top" zone the load-more
    // gate reacts to.
    for (let i = 0; i < 8; i++) {
      fireEvent.scroll(outer as Element, {});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60);
      });
    }

    // Once the window climbs past the clamp the whole transcript is mounted.
    // While the guard latched, this stayed pinned at `clamped` for ever.
    expect(countRendered()).toBe(TOTAL);
  });
});
