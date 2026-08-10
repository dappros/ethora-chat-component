import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setComposing } from '../../roomStore/roomsSlice';
import MessageList from './MessageList';

// MessageList reads the xmpp client via context — sidestep mounting a real
// XmppProvider (and its connection setup) by mocking just the client it
// needs for the realtime private-store write under test.
const actionSetTimestampToPrivateStoreStanza = vi.fn();
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({
    client: { actionSetTimestampToPrivateStoreStanza },
  }),
}));

const ROOM_JID = 'room1@conference.example.com';
const SELF = 'me_1234@example.com';
const PEER = 'peer_5678@example.com';

// Regression coverage for the "New Messages" delimiter vanishing within ~5s
// of opening a chat with unread history. Root cause: the realtime
// setPrivateStore sync (added to keep the server's read-marker current
// while a room stays open) also re-dispatched setLastViewedTimestamp into
// Redux. That advanced the room's local lastViewedTimestamp mid-visit,
// which normalizeDelimiterPosition uses as the delimiter cutoff — moving it
// to "just now" (after all the genuinely-old unread messages) erased the
// delimiter. The fix: the debounced flush must talk to the server ONLY: it
// must never touch local room state, which stays owned by ChatRoom's
// enter/leave effects exactly as before this realtime sync existed.
describe('MessageList real-time mark-read', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    actionSetTimestampToPrivateStoreStanza.mockClear();
    // jsdom doesn't implement scrollTo — MessageList calls it unconditionally
    // when following the conversation to the bottom.
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes the read marker to the server without touching local room state or the delimiter', async () => {
    const enteredAt = Date.now() - 100000; // simulates "entered a while ago"
    const oldMessageTs = enteredAt - 50000; // was already unread before this visit

    const storeRef = { current: null as any };
    renderWithProviders(
      <MessageList
        roomJID={ROOM_JID}
        user={{ xmppUsername: SELF } as any}
        loadMoreMessages={vi.fn()}
        loading={false}
        config={{}}
        isReply={false}
      />,
      {
        storeRef,
        preloadedState: {
          chatSettingStore: {
            user: { xmppUsername: SELF },
            config: {},
          } as any,
          rooms: {
            rooms: {
              [ROOM_JID]: {
                jid: ROOM_JID,
                messages: [
                  {
                    id: 'delimiter-new',
                    body: 'New Messages',
                    date: new Date(enteredAt).toISOString(),
                    roomJid: ROOM_JID,
                    user: { id: 'system', name: 'system' },
                  },
                  {
                    id: 'old-1',
                    body: 'hi, read this a while ago',
                    date: new Date(oldMessageTs).toISOString(),
                    roomJid: ROOM_JID,
                    user: { id: PEER, name: 'Peer' },
                  },
                ],
                composingList: [],
                lastViewedTimestamp: enteredAt,
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

    // A composing-indicator update while the room is open (deliberately NOT
    // an addRoomMessage/setRoomMessages dispatch — those already collapse
    // the delimiter for the active room by design, via a lastViewed-cutoff
    // of 0, which would confound this test). This is just the "user is
    // actively here" signal the auto-follow effect reacts to.
    await act(async () => {
      storeRef.current.dispatch(
        setComposing({ chatJID: ROOM_JID, composing: true, composingList: [PEER] })
      );
    });

    await act(async () => {
      // waitForImagesLoaded()'s promise chain (which sets up the debounce
      // timer via scrollToBottom -> scheduleMarkRead) runs on the
      // microtask queue, independent of the faked macrotask clock —
      // runAllTimersAsync interleaves both so the timer actually gets
      // scheduled before it's advanced.
      await vi.runAllTimersAsync();
    });

    expect(actionSetTimestampToPrivateStoreStanza).toHaveBeenCalledWith(
      ROOM_JID,
      expect.any(Number)
    );

    const room = storeRef.current.getState().rooms.rooms[ROOM_JID];
    // Local read-state must be untouched by the realtime flush — only
    // ChatRoom's enter/leave effects are allowed to move it.
    expect(room.lastViewedTimestamp).toBe(enteredAt);
    // The delimiter must still be exactly where it was — not erased, not
    // shifted past the old unread message.
    expect(room.messages.find((m: any) => m.id === 'delimiter-new')).toBeTruthy();
  });
});
