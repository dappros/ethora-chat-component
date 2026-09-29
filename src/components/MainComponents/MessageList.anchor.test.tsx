import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import MessageList from './MessageList';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null }),
}));

const ROOM_JID = 'room1@conference.example.com';
const SELF = 'me_1234@example.com';

// A room with a single message used to hang from the TOP of the pane while
// the opening preview that stands in for it sits at the BOTTOM, so the same
// message jumped when history arrived, and which one you saw depended on
// the room. Layout is not measurable in jsdom (the real measurement was
// taken in Chromium: content height identical to before, the single message
// 10px above the composer), so this locks the structure that produces it.
describe('MessageList - bottom anchoring', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  const renderList = () =>
    renderWithProviders(
      <MessageList
        roomJID={ROOM_JID}
        user={{ xmppUsername: SELF } as any}
        loadMoreMessages={vi.fn().mockResolvedValue(undefined)}
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
                messages: [
                  {
                    id: 'only-one',
                    body: 'the only message',
                    date: new Date(Date.UTC(2026, 0, 1)).toISOString(),
                    roomJid: ROOM_JID,
                    user: { id: 'peer_5678@example.com', name: 'Peer' },
                  },
                ],
                composingList: [],
                unreadMessages: 0,
                historyPreloadState: 'done',
                historyComplete: true,
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

  it('puts the transcript inside a flex anchor that pushes it to the bottom', () => {
    const { getByText } = renderList();
    const message = getByText('the only message');

    // scroller > anchor > flow > ...message
    let flow: HTMLElement | null = message;
    while (flow && flow.parentElement) {
      const style = getComputedStyle(flow.parentElement);
      if (style.justifyContent === 'flex-end') break;
      flow = flow.parentElement;
    }
    const anchor = flow?.parentElement;
    expect(anchor).toBeTruthy();
    const anchorStyle = getComputedStyle(anchor as HTMLElement);
    expect(anchorStyle.display).toBe('flex');
    expect(anchorStyle.flexDirection).toBe('column');
    expect(anchorStyle.justifyContent).toBe('flex-end');
    expect(anchorStyle.minHeight).toBe('100%');
  });

  it('keeps every message inside ONE block child of the anchor', () => {
    const { getByText } = renderList();
    let node: HTMLElement | null = getByText('the only message');
    let anchor: HTMLElement | null = null;
    while (node && node.parentElement) {
      if (getComputedStyle(node.parentElement).justifyContent === 'flex-end') {
        anchor = node.parentElement;
        break;
      }
      node = node.parentElement;
    }
    // Made direct flex items, messages lose margin collapsing (measured:
    // +110-150px on a real conversation), so the anchor must hold a single
    // ordinary block that contains all of them.
    expect(anchor?.children).toHaveLength(1);
  });
});
