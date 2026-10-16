import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { insertUsers, setRoomMessages } from '../../roomStore/roomsSlice';
import MessageList from './MessageList';
import { Message } from '../MessageBubble/Message';
import { IConfig, IMessage, RoomMember } from '../../types/types';

// Bubble-level render scope. Every bubble renders MessageInteractions as its
// last child, so counting MessageInteractions renders counts Message renders
// one for one (the mock returns null and records the message id).
const bubbleRenders = vi.hoisted(() => ({ byId: new Map<string, number>() }));
vi.mock('../MessageBubble/MessageInteractions', () => ({
  default: (props: { message: { id: string } }) => {
    const id = props.message.id;
    bubbleRenders.byId.set(id, (bubbleRenders.byId.get(id) ?? 0) + 1);
    return null;
  },
}));

const xmpp = vi.hoisted(() => ({
  client: {
    actionSetTimestampToPrivateStoreStanza: vi.fn(),
    sendDisplayedMarkerStanza: vi.fn(),
    getHistoryStanza: vi.fn(),
    sendMessageReactionStanza: vi.fn(),
  },
}));
vi.mock('../../context/xmppProvider', () => ({
  useXmppClient: () => ({ client: xmpp.client }),
}));

const ROOM = 'room1@conference.example.com';
const SELF = 'me_0000@example.com';
const BASE = Date.UTC(2026, 0, 1, 9, 0, 0);
const CONFIG: IConfig = {};
const USER_COUNT = 50;
const MESSAGE_COUNT = 200;

const peerLocal = (k: number) => `peer_${String(k).padStart(4, '0')}`;
const peerJid = (k: number) => `${peerLocal(k)}@example.com`;

const makeUsers = (): Record<string, RoomMember> => {
  const out: Record<string, RoomMember> = {};
  for (let k = 0; k < USER_COUNT; k++) {
    const local = peerLocal(k);
    out[local] = {
      xmppUsername: local,
      firstName: `First${k}`,
      lastName: `Last${k}`,
    } as unknown as RoomMember;
  }
  return out;
};

// Every message is from a peer (k = i % USER_COUNT). Message 195 carries a
// mention of peer 3 so one bubble can be checked against a mention target.
const makeMessages = (): IMessage[] =>
  Array.from({ length: MESSAGE_COUNT }, (_, i) => {
    const k = i % USER_COUNT;
    const body =
      i === 195 ? `hi @First3 Last3 how are you` : `message number ${i}`;
    return {
      id: `m${i}`,
      body,
      date: new Date(BASE + i * 60_000).toISOString(),
      roomJid: ROOM,
      xmppId: `x-${i}`,
      user: i === 195 ? { id: SELF, name: 'Me Self' } : { id: peerJid(k), name: '' },
      mentions:
        i === 195
          ? [{ jid: peerJid(3), name: 'First3 Last3', offset: 3, length: 13 }]
          : undefined,
    } as unknown as IMessage;
  });

const makeRoom = (messages: IMessage[]) =>
  ({
    jid: ROOM,
    name: ROOM,
    title: 'Big room',
    type: 'group',
    messages,
    members: Array.from({ length: USER_COUNT }, (_, k) => ({
      xmppUsername: peerLocal(k),
    })),
    usersCnt: USER_COUNT,
    composingList: [],
    composing: false,
    lastViewedTimestamp: 0,
    unreadBaselineTimestamp: 0,
    unreadMessages: 0,
    historyPreloadState: 'done',
    historyComplete: true,
    lastReceivedByUser: {},
    lastDisplayedByUser: {},
    isLoading: false,
  }) as any;

function setup() {
  const storeRef = { current: null as any };
  const messages = makeMessages();
  const utils = renderWithProviders(
    <MessageList
      roomJID={ROOM}
      loadMoreMessages={vi.fn()}
      loading={false}
      config={CONFIG}
      isReply={false}
      CustomMessage={Message as any}
    />,
    {
      storeRef,
      preloadedState: {
        chatSettingStore: {
          user: { xmppUsername: SELF, firstName: 'Me', lastName: 'Self' },
          config: CONFIG,
        } as any,
        rooms: {
          rooms: { [ROOM]: makeRoom(messages) },
          activeRoomJID: ROOM,
          isChatUiVisible: true,
          editAction: { isEdit: false },
          isLoading: false,
          loadingText: '',
          usersSet: makeUsers(),
          presenceByRoom: {},
          roomsLoadedOnce: true,
        } as any,
      },
    }
  );
  return { ...utils, store: storeRef };
}

// Runs one store update and reports which bubbles rendered during it.
async function measureBubbles(update: () => void): Promise<{ total: number; ids: string[] }> {
  bubbleRenders.byId.clear();
  await act(async () => {
    update();
  });
  const ids = [...bubbleRenders.byId.keys()].sort();
  const total = [...bubbleRenders.byId.values()].reduce((a, b) => a + b, 0);
  return { total, ids };
}

const mountedIds = () => new Set(bubbleRenders.byId.keys());

describe('MessageList bubble render scope', () => {
  beforeEach(() => {
    bubbleRenders.byId.clear();
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  it('(a) inserting an unrelated new user re-renders no bubble', async () => {
    const { store } = setup();
    const mounted = mountedIds();
    expect(mounted.size).toBeGreaterThan(0);

    const result = await measureBubbles(() =>
      store.current.dispatch(
        insertUsers({
          newUsers: [
            {
              xmppUsername: 'newcomer_9999',
              firstName: 'New',
              lastName: 'Comer',
            } as unknown as RoomMember,
          ],
        })
      )
    );
    expect(result.total).toBe(0);
    expect(store.current.getState().rooms.usersSet['newcomer_9999']).toBeDefined();
  });

  it('(b) renaming one sender re-renders only that sender bubbles and shows the new name', async () => {
    const { store } = setup();
    // Only the sender's bubbles that are mounted can render at all.
    const mounted = mountedIds();
    const senderOf7 = new Set(
      makeMessages()
        .filter((m) => m.user.id === peerJid(7) && mounted.has(m.id))
        .map((m) => m.id)
    );
    expect(senderOf7.size).toBeGreaterThan(0);

    const result = await measureBubbles(() =>
      store.current.dispatch(
        insertUsers({
          newUsers: [
            {
              xmppUsername: peerLocal(7),
              firstName: 'Renamed',
              lastName: 'Sevenfold',
            } as unknown as RoomMember,
          ],
        })
      )
    );
    expect(result.ids.every((id) => senderOf7.has(id))).toBe(true);
    expect(result.ids.length).toBe(senderOf7.size);
    expect(screen.getAllByText('Renamed Sevenfold').length).toBe(senderOf7.size);
  });

  it('(c) a mention target rename does not re-render the mentioning bubble', async () => {
    // The mentioning bubble is sent by SELF (m195) and does not subscribe to
    // the mention target's entry, so renaming peer 3 leaves it alone. The
    // label is the text typed at send time (see the open question in the
    // report), so no label change is expected either.
    const { store } = setup();
    expect(mountedIds().has('m195')).toBe(true);
    const result = await measureBubbles(() =>
      store.current.dispatch(
        insertUsers({
          newUsers: [
            {
              xmppUsername: peerLocal(3),
              firstName: 'Renamed',
              lastName: 'Threefold',
            } as unknown as RoomMember,
          ],
        })
      )
    );
    expect(result.ids).not.toContain('m195');
  });

  it('keeps the rest of the list untouched when a message is appended', async () => {
    const { store } = setup();
    const messages = makeMessages();
    const next = [
      ...messages,
      {
        id: 'm-new',
        body: 'fresh',
        date: new Date(BASE + 900 * 60_000).toISOString(),
        roomJid: ROOM,
        xmppId: 'x-new',
        user: { id: peerJid(1), name: '' },
      } as unknown as IMessage,
    ];
    const result = await measureBubbles(() =>
      store.current.dispatch(setRoomMessages({ roomJID: ROOM, messages: next }))
    );
    expect(result.ids).not.toContain('m0');
  });
});
