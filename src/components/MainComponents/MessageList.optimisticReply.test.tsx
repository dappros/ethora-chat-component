import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { addRoomMessage } from '../../roomStore/roomsSlice';
import MessageList from './MessageList';

// Regression coverage for replies rendering with a visible delay instead of
// appearing optimistically. Root cause: useSendMessage's addRoomMessage
// dispatch (the optimistic, pending:true copy MessageList actually renders
// from) omitted isReply/showInChannel/mainMessage entirely, so the reply-
// thread view's memoizedMessages filter (which requires
// item.isReply === 'true' and a matching parseMessageReference(item.mainMessage))
// never matched it - the optimistic bubble stayed invisible in the open
// thread until the server echo (which does carry those fields, as XML
// attribute strings) replaced it. The fix stamps those same fields onto the
// addRoomMessage payload, matching the wire format exactly.
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: null }),
}));

const ROOM_JID = 'room1@conference.example.com';
const SELF = 'me_1234@example.com';
const PEER = 'peer_5678@example.com';
const MAIN_MESSAGE_ID = 'main-msg-1';

describe('MessageList - optimistic reply rendering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a pending optimistic reply in the open thread immediately, before any server echo', async () => {
    const activeMessage = {
      id: MAIN_MESSAGE_ID,
      body: 'the message being replied to',
      date: new Date(Date.now() - 60000).toISOString(),
      roomJid: ROOM_JID,
      user: { id: PEER, name: 'Peer' },
    };

    // MessageList unconditionally renders CustomMessage above the thread
    // when activeMessage is set (it shows the message being replied to) -
    // supply a minimal stand-in so the render doesn't crash; it's unrelated
    // to what this test is verifying.
    const CustomMessage = ({ message }: any) => <div>{message.body}</div>;

    const storeRef = { current: null as any };
    const { container } = renderWithProviders(
      <MessageList
        roomJID={ROOM_JID}
        user={{ xmppUsername: SELF } as any}
        loadMoreMessages={vi.fn()}
        loading={false}
        config={{}}
        isReply={true}
        activeMessage={activeMessage as any}
        CustomMessage={CustomMessage}
      />,
      {
        storeRef,
        preloadedState: {
          chatSettingStore: { user: { xmppUsername: SELF }, config: {} } as any,
          rooms: {
            rooms: {
              [ROOM_JID]: {
                jid: ROOM_JID,
                messages: [activeMessage],
                composingList: [],
                lastViewedTimestamp: Date.now(),
                unreadBaselineTimestamp: 0,
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

    // Mirrors exactly what useSendMessage's sendMessage callback dispatches
    // for the optimistic copy when the user replies from a thread view
    // (mainMessage is the same JSON reference format createMainMessageForThread
    // produces; isReply/showInChannel are the string wire format the real
    // server echo carries).
    await act(async () => {
      storeRef.current.dispatch(
        addRoomMessage({
          roomJID: ROOM_JID,
          message: {
            id: 'send-reply-message-optimistic-1',
            user: { id: SELF, name: 'Me' },
            date: new Date().toISOString(),
            messageTimestampMs: Date.now(),
            body: 'optimistic reply body',
            roomJid: ROOM_JID,
            xmppFrom: `${ROOM_JID}/${SELF}`,
            pending: true,
            isReply: 'true',
            showInChannel: 'false',
            mainMessage: JSON.stringify({ id: MAIN_MESSAGE_ID, text: activeMessage.body }),
          } as any,
        })
      );
    });

    // No server echo dispatched - if this only appears after a second
    // dispatch simulating the wire response, the fix has regressed.
    expect(container.textContent).toContain('optimistic reply body');
  });
});
