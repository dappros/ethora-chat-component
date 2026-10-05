import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@xmpp/client', () => ({
  default: {
    client: vi.fn(() => ({
      setMaxListeners: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    })),
  },
  xml: (...args: any[]) => ({ args }),
}));

import { XmppClient } from './xmppClient';
import { store } from '../roomStore';
import {
  addRoom,
  deleteAllRooms,
  setRoomMessages,
  updateRoom,
} from '../roomStore/roomsSlice';
import { IRoom } from '../types/types';

const ROOM = 'room1@conference.example.com';

const fin = (id: string, first: string, last: string, complete = 'false') => ({
  is: (n: string) => n === 'iq',
  attrs: { id, type: 'result', from: ROOM },
  getChild: (n: string) =>
    n === 'fin'
      ? {
          attrs: { complete },
          getChild: () => ({
            getChildText: (c: string) => (c === 'first' ? first : last),
          }),
        }
      : undefined,
});

const setup = (messages: any[], cursor: number) => {
  store.dispatch(deleteAllRooms());
  store.dispatch(
    addRoom({
      roomData: { jid: ROOM, name: ROOM, messages: [] } as unknown as IRoom,
    })
  );
  if (messages.length)
    store.dispatch(setRoomMessages({ roomJID: ROOM, messages }));
  store.dispatch(
    updateRoom({
      jid: ROOM,
      updates: {
        messageStats: {
          firstMessageTimestamp: cursor,
          lastMessageTimestamp: 9e15,
        },
      },
    })
  );
  const client = new XmppClient('u', 'p') as any;
  return client;
};

const register = (client: any, id: string, before?: number) =>
  client.mamRequestRegistry.set(id, {
    id,
    chatJID: ROOM,
    before,
    messages: [],
    startedAt: Date.now(),
    timeout: setTimeout(() => {}, 1),
    resolve: () => {},
  });

const cursorNow = () =>
  store.getState().rooms.rooms[ROOM].messageStats?.firstMessageTimestamp;

describe('MAM paging cursor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a late LATEST-page fin does not pull the cursor forward past an older one', () => {
    const client = setup(
      [
        {
          id: '1700000000000005',
          body: 'x',
          date: new Date().toISOString(),
          roomJid: ROOM,
        },
      ],
      1500000000000000
    );
    register(client, 'a');
    client.routeMamStanza(fin('a', '1700000000000000', '1700000000000009'));
    expect(cursorNow()).toBe(1500000000000000);
  });

  it('an older-page fin (before set) moves the cursor back as usual', () => {
    const client = setup(
      [
        {
          id: '1700000000000005',
          body: 'x',
          date: new Date().toISOString(),
          roomJid: ROOM,
        },
      ],
      1700000000000000
    );
    register(client, 'b', 1700000000000000);
    client.routeMamStanza(fin('b', '1600000000000000', '1699999999999999'));
    expect(cursorNow()).toBe(1600000000000000);
  });

  it('a latest page for a room with no messages sets the cursor from the page', () => {
    const client = setup([], 1500000000000000);
    register(client, 'c');
    client.routeMamStanza(fin('c', '1700000000000000', '1700000000000009'));
    expect(cursorNow()).toBe(1700000000000000);
  });
});
