import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runHistoryPreloadScheduler } from './historyPreloadScheduler';
import { store } from '../roomStore';
import { addRoom, deleteAllRooms } from '../roomStore/roomsSlice';
import { IRoom } from '../types/types';

const ROOM_A = 'rooma@conference.xmpp.example.com';
const ROOM_B = 'roomb@conference.xmpp.example.com';

const seedRoom = (jid: string) => {
  store.dispatch(
    addRoom({
      roomData: {
        jid,
        name: jid,
        messages: [],
        historyPreloadState: 'idle',
      } as unknown as IRoom,
    })
  );
};

const makeClient = (getHistoryStanza: any) =>
  ({
    getHistoryStanza,
    isActiveRoomGateOpen: () => true,
    promoteRoomHistory: vi.fn(),
    client: { jid: { toString: () => 'tester@example.com/web' } },
  }) as any;

const stateOf = (jid: string) => store.getState().rooms.rooms[jid];

describe('historyPreloadScheduler, an empty MAM page is inconclusive, not done', () => {
  beforeEach(() => {
    store.dispatch(deleteAllRooms());
  });

  // Live-observed: rooms whose background preload got an empty page were
  // marked 'done' with an empty transcript, so the sidebar preview stayed
  // blank forever and nothing ever retried them, yet opening the room by
  // hand loaded the history fine.
  it('leaves a room retryable (not done) when the server returns an empty page', async () => {
    seedRoom(ROOM_A);

    const getHistoryStanza = vi.fn().mockResolvedValue([]);
    await runHistoryPreloadScheduler({
      client: makeClient(getHistoryStanza),
      concurrency: 1,
      pageSize: 10,
      retryLimit: 0,
    });

    expect(stateOf(ROOM_A).historyPreloadState).toBe('partial');
    expect(stateOf(ROOM_A).historyPreloadState).not.toBe('done');
  });

  it('retries an empty page within the same sweep', async () => {
    seedRoom(ROOM_A);

    const getHistoryStanza = vi.fn().mockResolvedValue([]);
    await runHistoryPreloadScheduler({
      client: makeClient(getHistoryStanza),
      concurrency: 1,
      pageSize: 10,
      retryLimit: 2,
    });

    // Initial attempt + 2 retries.
    expect(getHistoryStanza).toHaveBeenCalledTimes(3);
  });

  it('still marks a room done when messages actually arrive', async () => {
    seedRoom(ROOM_B);

    const getHistoryStanza = vi.fn().mockResolvedValue([
      {
        id: 'm1',
        body: 'hello',
        date: new Date().toISOString(),
        roomJid: ROOM_B,
        user: { id: 'peer@example.com', name: 'Peer' },
      },
    ]);

    await runHistoryPreloadScheduler({
      client: makeClient(getHistoryStanza),
      concurrency: 1,
      pageSize: 10,
      retryLimit: 0,
    });

    expect(stateOf(ROOM_B).historyPreloadState).toBe('done');
    expect(stateOf(ROOM_B).messages.length).toBeGreaterThan(0);
  });
});
