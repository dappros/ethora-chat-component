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

const mk = (prefix: string, i: number) => ({
  id: `${prefix}-${String(i).padStart(4, '0')}`,
  body: `${prefix}tok_${i}_end`,
  date: new Date(Date.now() - (100 - i) * 10000).toISOString(),
  roomJid: ROOM_JID,
  user: { id: PEER, name: 'Peer' },
});

const render = (withWindow: boolean) => {
  const storeRef = { current: null as any };
  const utils = renderWithProviders(
    <MessageList
      roomJID={ROOM_JID}
      user={{ xmppUsername: SELF } as any}
      loadMoreMessages={vi.fn().mockResolvedValue(undefined)}
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
              messages: Array.from({ length: 30 }, (_, i) => mk('live', i)),
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
          jumpWindow: withWindow
            ? {
                roomJID: ROOM_JID,
                messages: Array.from({ length: 21 }, (_, i) => mk('win', i)),
                targetId: 'win-0010',
                olderCursor: 1,
                hasOlder: false,
                newerCursor: 2,
                hasNewer: false,
              }
            : null,
        } as any,
      },
    }
  );
  return { ...utils, storeRef };
};

describe('MessageList with a jump window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.HTMLElement.prototype.scrollTo = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the window instead of the live list', () => {
    const { container } = render(true);
    const text = container.textContent || '';
    expect(text).toContain('wintok_10_end');
    expect(text).toContain('wintok_20_end');
    expect(text).not.toContain('livetok_');
    expect(
      container.querySelectorAll('[data-message-id]').length
    ).toBeLessThanOrEqual(21);
  });

  it('renders the live list when there is no window', () => {
    const { container, queryByTestId } = render(false);
    expect(container.textContent).toContain('livetok_29_end');
    expect(queryByTestId('jump-to-latest')).toBeNull();
  });

  it('"Jump to latest" clears the window and shows the live tail', async () => {
    const { container, getByTestId, storeRef } = render(true);
    expect(storeRef.current.getState().rooms.jumpWindow).not.toBeNull();

    await act(async () => {
      fireEvent.click(getByTestId('jump-to-latest'));
      await vi.advanceTimersByTimeAsync(20);
    });

    expect(storeRef.current.getState().rooms.jumpWindow).toBeNull();
    const text = container.textContent || '';
    expect(text).toContain('livetok_29_end');
    expect(text).not.toContain('wintok_');
  });
});
