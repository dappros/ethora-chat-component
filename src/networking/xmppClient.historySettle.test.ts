import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fakeXmppClient = {
  jid: { toString: () => 'me@example.com/res', domain: 'example.com' },
  setMaxListeners: vi.fn(),
  reconnect: { stop: vi.fn() },
  on: vi.fn(),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
  start: vi.fn(() => Promise.resolve()),
  send: vi.fn(() => Promise.resolve()),
};

vi.mock('@xmpp/client', () => ({
  default: { client: vi.fn(() => fakeXmppClient) },
  xml: (...args: any[]) => ({ args }),
}));

import { XmppClient } from './xmppClient';
import { store } from '../roomStore';
import { addRoom, deleteAllRooms } from '../roomStore/roomsSlice';
import { IRoom } from '../types/types';

const ROOM = 'room1@conference.example.com';
const msg = (id: string) =>
  ({ id, body: id, date: new Date().toISOString(), roomJid: ROOM }) as any;

const seed = () => {
  store.dispatch(deleteAllRooms());
  store.dispatch(
    addRoom({
      roomData: { jid: ROOM, name: ROOM, messages: [] } as unknown as IRoom,
    })
  );
};

const online = () => {
  const client = new XmppClient('u', 'p') as any;
  client.status = 'online';
  client.client = fakeXmppClient;
  vi.spyOn(client, 'ensureRoomPresence').mockResolvedValue(true);
  return client;
};

describe('history requests always settle and release their keys', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    seed();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a background fetch queued for the active room runs at active priority (no gate deadlock)', async () => {
    const client = online();
    client.activeRoomJid = ROOM;
    const mam = vi
      .spyOn(client, 'requestMamHistory')
      .mockResolvedValue([msg('1700000000000001')]);
    const p = client.getHistoryStanza(ROOM, 15, undefined, undefined, {
      source: 'background',
      coalesceRoom: true,
    });
    // It was queued at active priority, not behind the background gate.
    expect(client.historyQueue[0].priority).toBe(0);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(p).resolves.toHaveLength(1);
    expect(mam).toHaveBeenCalledTimes(1);
    expect(client.historyPreloadInFlight.size).toBe(0);
    expect(client.activeHistoryInFlight.size).toBe(0);
  });

  it('an active-source request still closes the gate while it is pending', () => {
    const client = online();
    client.activeRoomJid = ROOM;
    client.activeHistoryInFlight.set(`${ROOM}::active`, new Promise(() => {}));
    expect(client.isActiveRoomGateOpen()).toBe(false);
    client.activeHistoryInFlight.clear();
    client.activeHistoryInFlight.set(
      `${ROOM}::background`,
      new Promise(() => {})
    );
    expect(client.isActiveRoomGateOpen()).toBe(true);
  });

  it('the active request reuses a background task that settles empty by asking again once', async () => {
    const client = online();
    let calls = 0;
    vi.spyOn(client, 'requestMamHistory').mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? [] : [msg('1700000000000002')];
    });
    const bg = client.getHistoryStanza(ROOM, 15, undefined, undefined, {
      source: 'background',
      coalesceRoom: true,
    });
    const active = client.getHistoryStanza(ROOM, 30, undefined, undefined, {
      source: 'active',
      coalesceRoom: true,
    });
    await vi.advanceTimersByTimeAsync(3000);
    await bg;
    const got = await active;
    expect(calls).toBe(2);
    expect(got).toHaveLength(1);
    expect(client.historyPreloadInFlight.size).toBe(0);
  });

  it('watchdog: a request that never runs is aborted, keys freed, the active request re-issued once', async () => {
    const client = online();
    // The queue never starts anything.
    vi.spyOn(client, 'scheduleHistoryQueue').mockImplementation(() => {});
    const p = client.getHistoryStanza(ROOM, 30, undefined, undefined, {
      source: 'active',
      coalesceRoom: true,
    });
    expect(client.historyPreloadInFlight.size).toBe(1);
    await vi.advanceTimersByTimeAsync(15001);
    // First attempt aborted and its task dropped, one re-issue now waits.
    expect(client.historyQueue).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(15001);
    await expect(p).resolves.toBeUndefined();
    expect(client.historyQueue).toHaveLength(0);
    expect(client.historyPreloadInFlight.size).toBe(0);
    expect(client.activeHistoryInFlight.size).toBe(0);
  });

  it('watchdog: a hung execution frees the only history slot', async () => {
    const client = online();
    client.activeRoomJid = null;
    vi.spyOn(client, 'requestMamHistory').mockImplementation(
      () => new Promise(() => {})
    );
    const hung = client.getHistoryStanza(ROOM, 15, undefined, undefined, {
      source: 'background',
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(client.historyQueueInFlight).toBe(1);
    await vi.advanceTimersByTimeAsync(15001);
    await expect(hung).resolves.toBeUndefined();
    expect(client.historyQueueInFlight).toBe(0);
    expect(client.historyPreloadInFlight.size).toBe(0);
  });

  it('keys are released when the task throws', async () => {
    const client = online();
    vi.spyOn(client, 'requestMamHistory').mockRejectedValue(new Error('boom'));
    const p = client.getHistoryStanza(ROOM, 15, undefined, undefined, {
      source: 'active',
      coalesceRoom: true,
    });
    await vi.advanceTimersByTimeAsync(3000);
    await expect(p).resolves.toBeUndefined();
    expect(client.historyPreloadInFlight.size).toBe(0);
    expect(client.activeHistoryInFlight.size).toBe(0);
  });

  it('a stale task finishing after a reset does not drive the new counters negative or wipe new keys', async () => {
    const client = online();
    client.attachEventListeners?.();
    let finish!: (v: any) => void;
    vi.spyOn(client, 'requestMamHistory').mockImplementation(
      () => new Promise((r) => (finish = r))
    );
    const p = client.getHistoryStanza(ROOM, 15, undefined, undefined, {
      source: 'background',
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(client.historyQueueInFlight).toBe(1);
    client.clearHistoryQueue();
    client.historyPreloadInFlight.clear();
    client.historyQueueInFlight = 1; // a task of the NEW connection
    finish([]);
    await vi.advanceTimersByTimeAsync(100);
    await p;
    expect(client.historyQueueInFlight).toBe(1);
  });
});
