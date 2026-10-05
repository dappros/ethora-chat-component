import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../../roomStore';
import { allRoomPresences } from './allRoomPresences.xmpp';

const room = (n: number) => `r${n}@conference.example.com`;

const seedRooms = (scores: Record<string, number>) => {
  const rooms: Record<string, any> = {};
  Object.keys(scores).forEach((jid) => {
    rooms[jid] = { jid, messages: [], lastMessageTimestamp: scores[jid] };
  });
  vi.spyOn(store, 'getState').mockReturnValue({
    rooms: { rooms, activeRoomJID: '' },
  } as any);
};

const rankFromStore = (jid: string) =>
  (store.getState().rooms.rooms as any)[jid].lastMessageTimestamp;

describe('allRoomPresences (background sweep)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('joins by recent activity, newest first', async () => {
    seedRooms({ [room(1)]: 10, [room(2)]: 30, [room(3)]: 20 });
    const order: string[] = [];
    const p = allRoomPresences(
      {} as any,
      async (jid) => {
        order.push(jid);
        return true;
      },
      { concurrency: 1, rank: rankFromStore }
    );
    await vi.runAllTimersAsync();
    await p;
    expect(order).toEqual([room(2), room(3), room(1)]);
  });

  it('joins the active room first regardless of its activity', async () => {
    seedRooms({ [room(1)]: 10, [room(2)]: 30, [room(3)]: 20 });
    const order: string[] = [];
    const p = allRoomPresences(
      {} as any,
      async (jid) => {
        order.push(jid);
        return true;
      },
      {
        concurrency: 1,
        rank: rankFromStore,
        getActiveRoomJid: () => room(1),
      }
    );
    await vi.runAllTimersAsync();
    await p;
    expect(order[0]).toBe(room(1));
  });

  it('promotes a room opened while it is still queued', async () => {
    seedRooms({ [room(1)]: 40, [room(2)]: 30, [room(3)]: 20, [room(4)]: 10 });
    let active: string | null = null;
    const order: string[] = [];
    const p = allRoomPresences(
      {} as any,
      async (jid) => {
        order.push(jid);
        // The user opens the least active room during the first join.
        if (order.length === 1) active = room(4);
        return true;
      },
      {
        concurrency: 1,
        rank: rankFromStore,
        getActiveRoomJid: () => active,
      }
    );
    await vi.runAllTimersAsync();
    await p;
    expect(order).toEqual([room(1), room(4), room(2), room(3)]);
  });

  it('skips rooms already joined (reconnect resumes only the unjoined)', async () => {
    seedRooms({ [room(1)]: 10, [room(2)]: 30, [room(3)]: 20 });
    const joined = new Set([room(2)]);
    const order: string[] = [];
    const p = allRoomPresences(
      {} as any,
      async (jid) => {
        order.push(jid);
        joined.add(jid);
        return true;
      },
      { concurrency: 1, rank: rankFromStore, isJoined: (j) => joined.has(j) }
    );
    await vi.runAllTimersAsync();
    const summary = await p;
    expect(order).toEqual([room(3), room(1)]);
    expect(summary.total).toBe(2);
  });

  it('does not wait on a room that never answers: others keep joining', async () => {
    seedRooms({ [room(1)]: 40, [room(2)]: 30, [room(3)]: 20 });
    const done: string[] = [];
    const p = allRoomPresences(
      {} as any,
      (jid) =>
        jid === room(1)
          ? new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000))
          : (done.push(jid), Promise.resolve(true)),
      { concurrency: 2, rank: rankFromStore }
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toEqual([room(2), room(3)]);
    await vi.runAllTimersAsync();
    const summary = await p;
    expect(summary.failedRooms).toEqual([room(1)]);
  });

  it('fires onPriorityDone after the first wave, before the sweep ends', async () => {
    const scores: Record<string, number> = {};
    for (let i = 0; i < 12; i += 1) scores[room(i)] = 100 - i;
    seedRooms(scores);
    const onPriorityDone = vi.fn();
    let resolved = 0;
    const p = allRoomPresences(
      {} as any,
      async () => {
        resolved += 1;
        return true;
      },
      { concurrency: 3, rank: rankFromStore, onPriorityDone }
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(onPriorityDone).toHaveBeenCalledTimes(1);
    expect(resolved).toBeLessThan(12);
    await vi.runAllTimersAsync();
    await p;
    expect(onPriorityDone).toHaveBeenCalledTimes(1);
  });

  it('stops joining once cancelled (connection replaced)', async () => {
    seedRooms({ [room(1)]: 3, [room(2)]: 2, [room(3)]: 1 });
    let cancelled = false;
    const order: string[] = [];
    const p = allRoomPresences(
      {} as any,
      async (jid) => {
        order.push(jid);
        cancelled = true;
        return true;
      },
      { concurrency: 1, rank: rankFromStore, isCancelled: () => cancelled }
    );
    await vi.runAllTimersAsync();
    await p;
    expect(order).toEqual([room(1)]);
  });

  it('picks up rooms that appear while the sweep runs', async () => {
    const scores: Record<string, number> = { [room(1)]: 2 };
    seedRooms(scores);
    const order: string[] = [];
    const p = allRoomPresences(
      {} as any,
      async (jid) => {
        order.push(jid);
        if (jid === room(1)) {
          scores[room(9)] = 1;
          seedRooms(scores);
        }
        return true;
      },
      { concurrency: 1, rank: rankFromStore }
    );
    await vi.runAllTimersAsync();
    await p;
    expect(order).toEqual([room(1), room(9)]);
  });
});
