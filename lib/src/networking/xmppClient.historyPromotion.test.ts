import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeXmppClient = {
  jid: { toString: () => 'me@example.com/res', domain: 'example.com' },
  setMaxListeners: vi.fn(),
  reconnect: { stop: vi.fn() },
  on: vi.fn(),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
  start: vi.fn(() => Promise.resolve()),
};

vi.mock('@xmpp/client', () => ({
  default: { client: vi.fn(() => fakeXmppClient) },
  xml: (...args: any[]) => ({ args }),
}));

import { XmppClient } from './xmppClient';
import { store } from '../roomStore';
import {
  addRoom,
  deleteAllRooms,
  setRoomMessages,
} from '../roomStore/roomsSlice';
import { IRoom } from '../types/types';

const ROOM = 'room1@conference.example.com';

const m = (id: string, ts: number) =>
  ({
    id,
    body: `b${id}`,
    date: new Date(ts).toISOString(),
    roomJid: ROOM,
    user: { id: 'peer', name: 'peer' },
  }) as any;

const seedRoom = (messages: any[] = []) => {
  store.dispatch(deleteAllRooms());
  store.dispatch(
    addRoom({
      roomData: { jid: ROOM, name: ROOM, messages: [] } as unknown as IRoom,
    })
  );
  if (messages.length) {
    store.dispatch(setRoomMessages({ roomJID: ROOM, messages }));
  }
};

const stored = () =>
  store.getState().rooms.rooms[ROOM].messages.filter(
    (x: any) => x.id !== 'delimiter-new'
  );

describe('XmppClient history: a room opened while its background fetch is in flight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const task = (extra: Record<string, unknown> = {}) => {
    const resolve = vi.fn();
    return {
      task: {
        id: 't1',
        chatJID: ROOM,
        max: 15,
        source: 'background',
        priority: 2,
        epoch: 0,
        queuedAt: Date.now(),
        resolve,
        ...extra,
      },
      resolve,
    };
  };

  it('keeps the fetched page instead of dropping it when the room was promoted meanwhile', async () => {
    seedRoom();
    const client = new XmppClient('user', 'pass') as any;
    client.status = 'online';
    const page = [m('1', Date.now() - 3000), m('2', Date.now() - 2000)];
    vi.spyOn(client, 'ensureRoomPresence').mockResolvedValue(true);
    vi.spyOn(client, 'requestMamHistory').mockResolvedValue(page);
    // Opening the room bumped its epoch (promoteRoomHistory) mid-flight.
    client.roomHistoryEpoch.set(ROOM, 5);
    client.activeRoomJid = ROOM;

    const { task: t, resolve } = task({ epoch: 0 });
    await client.executeHistoryTask(t);

    expect(resolve).toHaveBeenCalledWith(page);
    expect(stored()).toHaveLength(2);
  });

  it('still drops a stale result for a non-active room that already shows messages', async () => {
    seedRoom([m('old', Date.now() - 9000)]);
    const client = new XmppClient('user', 'pass') as any;
    client.status = 'online';
    vi.spyOn(client, 'ensureRoomPresence').mockResolvedValue(true);
    vi.spyOn(client, 'requestMamHistory').mockResolvedValue([
      m('x', Date.now() - 1000),
    ]);
    client.roomHistoryEpoch.set(ROOM, 5);
    client.activeRoomJid = 'other@conference.example.com';

    const { task: t, resolve } = task({ epoch: 0 });
    await client.executeHistoryTask(t);

    expect(stored().map((x: any) => x.id)).toEqual(['old']);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});

describe('XmppClient history: a latest page that skips the cache replaces it', () => {
  it('merges an overlapping page', () => {
    const t0 = Date.now() - 100_000;
    seedRoom([m('1', t0), m('2', t0 + 1000), m('3', t0 + 2000)]);
    const client = new XmppClient('user', 'pass') as any;
    client.storeHistoryPage({ chatJID: ROOM, max: 3, before: undefined }, [
      m('3', t0 + 2000),
      m('4', t0 + 3000),
      m('5', t0 + 4000),
    ]);
    expect(stored().map((x: any) => x.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('replaces the cache when a full page starts after everything cached (no silent hole)', () => {
    const t0 = Date.now() - 100_000;
    seedRoom([m('1', t0), m('2', t0 + 1000)]);
    const client = new XmppClient('user', 'pass') as any;
    client.storeHistoryPage({ chatJID: ROOM, max: 3, before: undefined }, [
      m('7', t0 + 50_000),
      m('8', t0 + 51_000),
      m('9', t0 + 52_000),
    ]);
    expect(stored().map((x: any) => x.id)).toEqual(['7', '8', '9']);
  });

  it('does not replace for a short page or an older-page (before) request', () => {
    const t0 = Date.now() - 100_000;
    seedRoom([m('1', t0)]);
    const client = new XmppClient('user', 'pass') as any;
    client.storeHistoryPage({ chatJID: ROOM, max: 3, before: undefined }, [
      m('7', t0 + 50_000),
    ]);
    expect(stored().map((x: any) => x.id)).toEqual(['1', '7']);
    client.storeHistoryPage({ chatJID: ROOM, max: 1, before: 123 }, [
      m('8', t0 + 60_000),
    ]);
    expect(stored().map((x: any) => x.id)).toEqual(['1', '7', '8']);
  });
});

describe('XmppClient getHistoryStanza: teaser reuse', () => {
  it('does not hand an opened room the one-message teaser in place of its full page', async () => {
    seedRoom();
    const client = new XmppClient('user', 'pass') as any;
    let resolveTeaser: (v: any) => void = () => {};
    const teaser = new Promise<any>((r) => (resolveTeaser = r));
    const key = client.getHistoryInFlightKey(ROOM, undefined);
    client.historyPreloadInFlight.set(key, { max: 1, promise: teaser });
    const enqueue = vi
      .spyOn(client, 'enqueueHistoryTask')
      .mockResolvedValue([m('1', Date.now()), m('2', Date.now() + 1)]);
    vi.spyOn(client, 'promoteRoomHistory').mockImplementation(() => {});

    const p = client.getHistoryStanza(ROOM, 30, undefined, undefined, {
      source: 'active',
      coalesceRoom: true,
    });
    await Promise.resolve();
    expect(enqueue).not.toHaveBeenCalled(); // waiting for the teaser
    resolveTeaser([m('1', Date.now())]);
    const res = await p;
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(res).toHaveLength(2);
  });

  it('still reuses a full-size in-flight page', async () => {
    seedRoom();
    const client = new XmppClient('user', 'pass') as any;
    const full = Promise.resolve([m('1', Date.now())]);
    client.historyPreloadInFlight.set(
      client.getHistoryInFlightKey(ROOM, undefined),
      { max: 20, promise: full }
    );
    const enqueue = vi.spyOn(client, 'enqueueHistoryTask');
    vi.spyOn(client, 'promoteRoomHistory').mockImplementation(() => {});
    const res = await client.getHistoryStanza(ROOM, 30, undefined, undefined, {
      source: 'active',
      coalesceRoom: true,
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(res).toHaveLength(1);
  });
});

describe('XmppClient joinHistoryStanzas', () => {
  it('defaults to 0 and reads historyQoS.joinHistoryStanzas', () => {
    expect((new XmppClient('u', 'p') as any).joinHistoryStanzas).toBe(0);
    expect(
      (
        new XmppClient('u', 'p', {
          historyQoS: { joinHistoryStanzas: 20 },
        }) as any
      ).joinHistoryStanzas
    ).toBe(20);
    expect(
      (
        new XmppClient('u', 'p', {
          historyQoS: { joinHistoryStanzas: -4 },
        }) as any
      ).joinHistoryStanzas
    ).toBe(0);
  });
});
