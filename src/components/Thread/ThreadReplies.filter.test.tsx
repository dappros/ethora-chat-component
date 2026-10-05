import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import MessageList from '../MainComponents/MessageList';

vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null }),
}));

const ROOM = 'room1@conference.example.com';
const SELF = 'me_1@example.com';
const PEER = 'peer_2@example.com';

const base = (id: string, body: string, extra: any = {}) => ({
  id,
  body,
  date: new Date(Number(id)).toISOString(),
  roomJid: ROOM,
  user: { id: PEER, name: 'Peer' },
  ...extra,
});
const replyTo = (parentId: string, id: string, body: string) =>
  base(id, body, {
    isReply: 'true',
    mainMessage: JSON.stringify({ id: parentId, text: 'x' }),
  });

describe('thread list shows only the replies of its parent', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  it('filters replies per parent and hides plain room messages', () => {
    const parentA = base('1000', 'parent A');
    const parentB = base('1100', 'parent B');
    const messages = [
      parentA,
      parentB,
      base('1200', 'plain room message'),
      replyTo('1000', '2000', 'reply to A one'),
      replyTo('1100', '2100', 'reply to B one'),
      replyTo('1000', '2200', 'reply to A two'),
    ];
    const CustomMessage = ({ message }: any) => <div>{message.body}</div>;
    const { container } = renderWithProviders(
      <MessageList
        roomJID={ROOM}
        user={{ xmppUsername: SELF } as any}
        loadMoreMessages={vi.fn()}
        loading={false}
        config={{}}
        isReply
        activeMessage={parentA as any}
        CustomMessage={CustomMessage}
      />,
      {
        preloadedState: {
          chatSettingStore: { user: { xmppUsername: SELF }, config: {} } as any,
          rooms: {
            rooms: {
              [ROOM]: {
                jid: ROOM,
                messages,
                composingList: [],
                lastViewedTimestamp: Date.now(),
                unreadBaselineTimestamp: 0,
                unreadMessages: 0,
                historyPreloadState: 'done',
                historyComplete: true,
              },
            },
            activeRoomJID: ROOM,
            isChatUiVisible: true,
            editAction: { isEdit: false },
            isLoading: false,
            loadingText: '',
            usersSet: {},
          } as any,
        },
      }
    );
    const text = container.textContent || '';
    expect(text).toContain('reply to A one');
    expect(text).toContain('reply to A two');
    expect(text).not.toContain('reply to B one');
    expect(text).not.toContain('plain room message');
  });
});
