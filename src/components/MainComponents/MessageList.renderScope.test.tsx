import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import {
  editRoomMessage,
  setComposing,
  setDisplayedMarker,
  setMemberOnline,
  setReactions,
  setReceivedReceipt,
  setReceivedWatermark,
  setRoomMessages,
  updateRoom,
} from '../../roomStore/roomsSlice';
import MessageList from './MessageList';
import { IConfig, IMessage } from '../../types/types';

// Render-scope regression coverage for the message list. The list must not
// re-render (and therefore must not re-render any bubble) for room-level
// updates that do not change what it shows, and it must still re-render when
// a message, reaction, history flag or the room itself changes.

const counters = vi.hoisted(() => ({ list: 0 }));

// ArchivedMessageCard is rendered directly by MessageList and is not memoized,
// so its render count is a faithful count of MessageList body renders.
vi.mock('./ArchivedMessageCard', () => ({
  default: () => {
    counters.list += 1;
    return null;
  },
}));

const xmpp = vi.hoisted(() => ({
  client: {
    actionSetTimestampToPrivateStoreStanza: vi.fn(),
    sendDisplayedMarkerStanza: vi.fn(),
  },
}));
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: xmpp.client }),
}));

const ROOM = 'room1@conference.example.com';
const OTHER_ROOM = 'room2@conference.example.com';
const SELF = 'me_1234@example.com';
const PEER = 'peer_5678@example.com';
const BASE = Date.UTC(2026, 0, 1, 9, 0, 0);
const CONFIG: IConfig = {};

// Each rendered bubble reports its message id here. Returning null keeps the
// bubble's own children out of the count (one call per rendered row).
const bubbleCalls: string[] = [];
const CountingBubble = (props: { message: IMessage }) => {
  bubbleCalls.push(props.message.id);
  return null;
};

const makeMessages = (roomJID: string, count: number): IMessage[] =>
  Array.from({ length: count }, (_, i) => {
    const own = i % 3 === 0;
    return {
      id: `${roomJID.split('@')[0]}-m${i}`,
      body: `message ${i}`,
      date: new Date(BASE + i * 60_000).toISOString(),
      roomJid: roomJID,
      xmppId: `x-${roomJID}-${i}`,
      user: own ? { id: SELF, name: 'Me' } : { id: PEER, name: 'Peer' },
    } as unknown as IMessage;
  });

const makeRoom = (roomJID: string, messages: IMessage[]) =>
  ({
    jid: roomJID,
    name: roomJID,
    type: 'group',
    messages,
    composingList: [],
    composing: false,
    members: [{ xmppUsername: PEER }, { xmppUsername: SELF }],
    usersCnt: 2,
    lastViewedTimestamp: 0,
    unreadBaselineTimestamp: 0,
    unreadMessages: 0,
    historyPreloadState: 'done',
    historyComplete: false,
    lastReceivedByUser: {},
    lastDisplayedByUser: {},
    isLoading: false,
  }) as any;

function setup(messageCount: number) {
  const storeRef = { current: null as any };
  const messages = makeMessages(ROOM, messageCount);
  const otherMessages = makeMessages(OTHER_ROOM, 5);
  const utils = renderWithProviders(
    <MessageList
      roomJID={ROOM}
      loadMoreMessages={vi.fn()}
      loading={false}
      config={CONFIG}
      isReply={false}
      CustomMessage={CountingBubble as any}
    />,
    {
      storeRef,
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: SELF },
          config: CONFIG,
        } as any,
        rooms: {
          rooms: {
            [ROOM]: makeRoom(ROOM, messages),
            [OTHER_ROOM]: makeRoom(OTHER_ROOM, otherMessages),
          },
          activeRoomJID: ROOM,
          isChatUiVisible: true,
          editAction: { isEdit: false },
          isLoading: false,
          loadingText: '',
          usersSet: {},
          presenceByRoom: {},
          roomsLoadedOnce: true,
        } as any,
      },
    }
  );
  return { ...utils, store: storeRef, messages };
}

// Runs one store update and reports what the list and its bubbles did.
async function measure(
  store: { current: any },
  update: () => void
): Promise<{ list: number; bubbles: number; bubbleIds: string[] }> {
  counters.list = 0;
  bubbleCalls.length = 0;
  await act(async () => {
    update();
  });
  return {
    list: counters.list,
    bubbles: bubbleCalls.length,
    bubbleIds: [...new Set(bubbleCalls)],
  };
}

describe('MessageList render scope', () => {
  beforeEach(() => {
    counters.list = 0;
    bubbleCalls.length = 0;
    xmpp.client.actionSetTimestampToPrivateStoreStanza.mockReset();
    xmpp.client.sendDisplayedMarkerStanza.mockReset();
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  it('does not re-render the list or any bubble for receipts, watermarks or displayed markers', async () => {
    const { store, messages } = setup(200);
    const last = messages[messages.length - 1];
    const sameLastOwn = messages[messages.length - 2];
    expect(counters.list).toBeGreaterThan(0);
    expect(bubbleCalls.length).toBeGreaterThan(0);

    const watermark = await measure(store, () =>
      store.current.dispatch(
        setReceivedWatermark({
          roomJID: ROOM,
          xmppUsername: PEER,
          messageId: last.id,
        })
      )
    );
    expect(watermark).toEqual({ list: 0, bubbles: 0, bubbleIds: [] });

    const displayed = await measure(store, () =>
      store.current.dispatch(
        setDisplayedMarker({
          roomJID: ROOM,
          xmppUsername: PEER,
          messageId: last.id,
        })
      )
    );
    expect(displayed).toEqual({ list: 0, bubbles: 0, bubbleIds: [] });

    // Same watermark moved again, and a second reader: still nothing to draw.
    const second = await measure(store, () =>
      store.current.dispatch(
        setReceivedWatermark({
          roomJID: ROOM,
          xmppUsername: SELF,
          messageId: sameLastOwn.id,
        })
      )
    );
    expect(second).toEqual({ list: 0, bubbles: 0, bubbleIds: [] });
  });

  it('re-renders only the one bubble whose message got a receipt', async () => {
    const { store, messages } = setup(200);
    const target = messages[messages.length - 2];

    const result = await measure(store, () =>
      store.current.dispatch(
        setReceivedReceipt({
          roomJID: ROOM,
          messageId: target.id,
          fromXmppUsername: PEER,
          timestamp: BASE + 10,
        })
      )
    );
    expect(result.list).toBe(1);
    expect(result.bubbleIds).toEqual([target.id]);
  });

  it('does not re-render the list or any bubble for room metadata or presence', async () => {
    const { store } = setup(200);

    const meta = await measure(store, () =>
      store.current.dispatch(
        updateRoom({
          jid: ROOM,
          updates: {
            usersCnt: 9,
            unreadMessages: 4,
            historyPreloadState: 'loading',
            lastViewedTimestamp: BASE,
          } as any,
        })
      )
    );
    expect(meta).toEqual({ list: 0, bubbles: 0, bubbleIds: [] });

    const presence = await measure(store, () =>
      store.current.dispatch(
        setMemberOnline({ roomJID: ROOM, xmppUsername: PEER })
      )
    );
    expect(presence).toEqual({ list: 0, bubbles: 0, bubbleIds: [] });

    // Another room changing must not touch this list either.
    const otherRoom = await measure(store, () =>
      store.current.dispatch(
        setReceivedWatermark({
          roomJID: OTHER_ROOM,
          xmppUsername: PEER,
          messageId: `${OTHER_ROOM.split('@')[0]}-m1`,
        })
      )
    );
    expect(otherRoom).toEqual({ list: 0, bubbles: 0, bubbleIds: [] });
  });

  it('typing updates re-render the typing row only, never the list or a bubble', async () => {
    const { store } = setup(200);

    await measure(store, () =>
      store.current.dispatch(
        setComposing({ chatJID: ROOM, composing: true, composingList: [PEER] })
      )
    );
    // Same typer count, different typers: nothing for the list to do.
    const sameCount = await measure(store, () =>
      store.current.dispatch(
        setComposing({ chatJID: ROOM, composing: true, composingList: ['x@e'] })
      )
    );
    expect(sameCount).toEqual({ list: 0, bubbles: 0, bubbleIds: [] });

    const stop = await measure(store, () =>
      store.current.dispatch(
        setComposing({ chatJID: ROOM, composing: false, composingList: [] })
      )
    );
    expect(stop.bubbles).toBe(0);
  });

  it('re-renders when a message is added, and only that bubble is new', async () => {
    const { store, messages } = setup(200);
    const newMessage = {
      id: 'new-1',
      body: 'hello',
      date: new Date(BASE + 500 * 60_000).toISOString(),
      roomJid: ROOM,
      xmppId: 'x-new',
      user: { id: PEER, name: 'Peer' },
    } as unknown as IMessage;

    const result = await measure(store, () =>
      store.current.dispatch(
        setRoomMessages({ roomJID: ROOM, messages: [...messages, newMessage] })
      )
    );
    expect(result.list).toBeGreaterThan(0);
    expect(result.bubbleIds).toContain('new-1');
    // Existing rows keep their identity, so only the new row (and the row it
    // may now close a run for) is drawn again.
    expect(result.bubbleIds.length).toBeLessThanOrEqual(3);
  });

  it('re-renders only the bubble whose body changed', async () => {
    const { store, messages } = setup(200);
    const target = messages[messages.length - 4];
    const result = await measure(store, () =>
      store.current.dispatch(
        editRoomMessage({
          roomJID: ROOM,
          messageId: target.id,
          text: 'edited body',
        })
      )
    );
    expect(result.list).toBeGreaterThan(0);
    expect(result.bubbleIds).toEqual([target.id]);
  });

  it('re-renders only the bubble whose reaction changed', async () => {
    const { store, messages } = setup(200);
    const target = messages[messages.length - 5];
    const result = await measure(store, () =>
      store.current.dispatch(
        setReactions({
          roomJID: ROOM,
          messageId: target.id,
          from: `${PEER}`,
          reactions: ['thumbs'],
        })
      )
    );
    expect(result.list).toBeGreaterThan(0);
    expect(result.bubbleIds).toEqual([target.id]);
  });

  it('re-renders the list when historyComplete flips', async () => {
    const { store } = setup(200);
    const result = await measure(store, () =>
      store.current.dispatch(
        updateRoom({ jid: ROOM, updates: { historyComplete: true } as any })
      )
    );
    expect(result.list).toBeGreaterThan(0);
  });

  it('re-renders for a different room prop', async () => {
    const { rerender, store } = setup(200);
    const before = counters.list;
    await act(async () => {
      rerender(
        <MessageList
          roomJID={OTHER_ROOM}
          loadMoreMessages={vi.fn()}
          loading={false}
          config={CONFIG}
          isReply={false}
          CustomMessage={CountingBubble as any}
        />
      );
    });
    expect(counters.list).toBeGreaterThan(before);
    expect(store.current).toBeTruthy();
  });

  it('bench: bubble and list renders for one receipt update in a 1000-message room', async () => {
    const { store, messages } = setup(1000);
    // Settle the initial mount before measuring.
    await act(async () => {});
    const target = messages[messages.length - 2];
    const receipt = await measure(store, () =>
      store.current.dispatch(
        setReceivedReceipt({
          roomJID: ROOM,
          messageId: target.id,
          fromXmppUsername: PEER,
          timestamp: BASE + 10,
        })
      )
    );
    const watermark = await measure(store, () =>
      store.current.dispatch(
        setReceivedWatermark({
          roomJID: ROOM,
          xmppUsername: PEER,
          messageId: messages[messages.length - 1].id,
        })
      )
    );
    expect(receipt.list).toBe(1);
    expect(receipt.bubbles).toBe(1);
  });
});
