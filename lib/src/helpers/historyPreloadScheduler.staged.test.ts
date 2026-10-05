import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runHistoryPreloadScheduler } from './historyPreloadScheduler';
import { store } from '../roomStore';
import {
  addRoom,
  deleteAllRooms,
  setCurrentRoom,
} from '../roomStore/roomsSlice';
import { IRoom } from '../types/types';

const jidOf = (n: number) => `room${n}@conference.xmpp.example.com`;

// `activity` newer = higher in the activity sort.
const seedRoom = (n: number, extra: Partial<IRoom> = {}, activity = n) => {
  store.dispatch(
    addRoom({
      roomData: {
        jid: jidOf(n),
        name: jidOf(n),
        messages: [],
        historyPreloadState: 'idle',
        lastMessageTimestamp: Date.now() - (1000 - activity) * 1000,
        ...extra,
      } as unknown as IRoom,
    })
  );
};

const page = (jid: string) => [
  {
    id: `m-${jid}`,
    body: 'hello',
    date: new Date().toISOString(),
    roomJid: jid,
    user: { id: 'peer@example.com', name: 'Peer' },
  },
];

const makeClient = (getHistoryStanza: any) =>
  ({
    getHistoryStanza,
    isActiveRoomGateOpen: () => true,
    promoteRoomHistory: vi.fn(),
    client: { jid: { toString: () => 'tester@example.com/web' } },
  }) as any;

const stateOf = (n: number) => store.getState().rooms.rooms[jidOf(n)];
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('historyPreloadScheduler staged behaviour', () => {
  beforeEach(() => {
    store.dispatch(deleteAllRooms());
    store.dispatch(setCurrentRoom({ roomJID: null }));
  });

  it('preloads only the top N rooms by recent activity', async () => {
    for (let n = 1; n <= 12; n += 1) seedRoom(n);
    const calls: string[] = [];
    const get = vi.fn(async (jid: string) => {
      calls.push(jid);
      return page(jid);
    });
    await runHistoryPreloadScheduler({
      client: makeClient(get),
      concurrency: 3,
      pageSize: 15,
      roomLimit: 4,
    });
    // Rooms 12, 11, 10, 9 are the most recently active.
    expect(new Set(calls)).toEqual(
      new Set([jidOf(12), jidOf(11), jidOf(10), jidOf(9)])
    );
    expect(stateOf(12).historyPreloadState).toBe('done');
    expect(stateOf(1).historyPreloadState).toBe('idle');
  });

  it('runs up to `concurrency` fetches at once, not sequentially', async () => {
    for (let n = 1; n <= 9; n += 1) seedRoom(n);
    let inFlight = 0;
    let peak = 0;
    const get = vi.fn(async (jid: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick(25);
      inFlight -= 1;
      return page(jid);
    });
    await runHistoryPreloadScheduler({
      client: makeClient(get),
      concurrency: 3,
      pageSize: 15,
    });
    expect(peak).toBe(3);
    expect(get).toHaveBeenCalledTimes(9);
  });

  it('does not let one slow room hold up the other slots (worker pool, not batches)', async () => {
    for (let n = 1; n <= 6; n += 1) seedRoom(n);
    const startedAt: Record<string, number> = {};
    const t0 = Date.now();
    const get = vi.fn(async (jid: string) => {
      startedAt[jid] = Date.now() - t0;
      // The most active room (6) is slow; the rest are instant.
      if (jid === jidOf(6)) await tick(400);
      return page(jid);
    });
    await runHistoryPreloadScheduler({
      client: makeClient(get),
      concurrency: 2,
      pageSize: 15,
    });
    // With batches of 2 the room started after the slow one would wait
    // ~400ms; a pool starts it as soon as the second slot is free.
    const lateStarts = Object.entries(startedAt).filter(
      ([jid]) => jid !== jidOf(6) && jid !== jidOf(5)
    );
    expect(lateStarts.every(([, t]) => t < 300)).toBe(true);
  });

  it('serves a room the user opened mid-sweep before the rest of the queue', async () => {
    for (let n = 1; n <= 6; n += 1) seedRoom(n);
    const order: string[] = [];
    const get = vi.fn(async (jid: string) => {
      order.push(jid);
      if (order.length === 1) {
        // User opens the LEAST active room while the first fetch is out.
        store.dispatch(setCurrentRoom({ roomJID: jidOf(1) }));
      }
      await tick(5);
      return page(jid);
    });
    await runHistoryPreloadScheduler({
      client: makeClient(get),
      concurrency: 1,
      pageSize: 15,
    });
    expect(order[0]).toBe(jidOf(6));
    expect(order[1]).toBe(jidOf(1));
  });

  it('does not refetch or flip rooms that are already done (reconnect sweep)', async () => {
    for (let n = 1; n <= 4; n += 1) seedRoom(n);
    const get = vi.fn(async (jid: string) => page(jid));
    const opts = { client: makeClient(get), concurrency: 2, pageSize: 15 };
    await runHistoryPreloadScheduler(opts);
    expect(get).toHaveBeenCalledTimes(4);

    // One room slipped back to 'partial' (e.g. an empty page); the others
    // are done. A second sweep (reconnect) must only touch that one.
    // (the room reducers keep an existing state, so go through the batch one)
    const { applyRoomsPreloadBatch } = await import('../roomStore/roomsSlice');
    store.dispatch(
      applyRoomsPreloadBatch({
        rooms: [{ jid: jidOf(2), historyPreloadState: 'partial' }],
      })
    );
    get.mockClear();
    const seen: string[] = [];
    const unsub = store.subscribe(() => {
      for (const n of [1, 3, 4]) {
        if (stateOf(n)?.historyPreloadState !== 'done') seen.push(jidOf(n));
      }
    });
    await runHistoryPreloadScheduler(opts);
    unsub();
    expect(get.mock.calls.map((c) => c[0])).toEqual([jidOf(2)]);
    expect(seen).toEqual([]);
  });

  it('keeps the top-N window fixed across sweeps (done rooms still count)', async () => {
    for (let n = 1; n <= 10; n += 1) seedRoom(n);
    const get = vi.fn(async (jid: string) => page(jid));
    const opts = {
      client: makeClient(get),
      concurrency: 3,
      pageSize: 15,
      roomLimit: 3,
    };
    await runHistoryPreloadScheduler(opts);
    await runHistoryPreloadScheduler(opts);
    await runHistoryPreloadScheduler(opts);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('teaser pass skips rooms whose preview came from the API and counts only rooms still lacking one', async () => {
    // 6 rooms: the 4 most active already have an API lastMessage.
    for (let n = 1; n <= 6; n += 1) {
      seedRoom(
        n,
        n >= 3
          ? ({
              lastMessage: {
                id: `l${n}`,
                body: 'from api',
                date: new Date().toISOString(),
                user: { id: 'x', name: 'X' },
              },
            } as unknown as Partial<IRoom>)
          : {}
      );
    }
    const calls: string[] = [];
    const get = vi.fn(async (jid: string) => {
      calls.push(jid);
      return page(jid);
    });
    await runHistoryPreloadScheduler({
      client: makeClient(get),
      concurrency: 2,
      pageSize: 1,
      roomLimit: 2,
      skipApiPreview: true,
      completionState: 'partial',
    });
    expect(new Set(calls)).toEqual(new Set([jidOf(1), jidOf(2)]));
    expect(stateOf(1).historyPreloadState).toBe('partial');
    // API-seeded rooms are untouched: no MAM query until they are opened.
    expect(stateOf(6).historyPreloadState).toBe('idle');
    expect(stateOf(6).messages).toHaveLength(0);
  });
});
