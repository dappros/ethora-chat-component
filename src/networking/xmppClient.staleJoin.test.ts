import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listeners = new Map<string, Array<(...args: unknown[]) => unknown>>();
const fakeXmppClient = {
  jid: { toString: () => 'me@example.com/res', domain: 'example.com' },
  setMaxListeners: vi.fn(),
  reconnect: { stop: vi.fn() },
  on: vi.fn((event: string, cb: (...args: unknown[]) => unknown) => {
    const arr = listeners.get(event) || [];
    arr.push(cb);
    listeners.set(event, arr);
  }),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(() => Promise.resolve()),
  send: vi.fn(),
};

vi.mock('@xmpp/client', () => ({
  default: { client: vi.fn(() => fakeXmppClient) },
  xml: (...args: unknown[]) => ({ args }),
}));

const presenceInRoom = vi.fn();
vi.mock('./xmpp/presenceInRoom.xmpp', () => ({
  presenceInRoom: (...a: unknown[]) => presenceInRoom(...a),
}));

import { store } from '../roomStore';
import { XmppClient } from './xmppClient';

const ROOM = 'a@conference.example.com';
const ROOM2 = 'b@conference.example.com';
const emit = async (event: string) => {
  for (const h of listeners.get(event) || []) await h();
};
const stubStore = (jids: string[]) =>
  vi.spyOn(store, 'getState').mockReturnValue({
    rooms: {
      rooms: Object.fromEntries(jids.map((j) => [j, { jid: j, messages: [] }])),
      activeRoomJID: '',
    },
  } as any);
const emptySummary = {
  total: 0,
  success: 0,
  failed: 0,
  failedRooms: [],
  sweptRooms: [],
};

const make = () => {
  const client = new XmppClient('u', 'p') as any;
  client.client = fakeXmppClient;
  client.attachEventListeners();
  vi.spyOn(client, 'ensureConnected').mockResolvedValue(undefined);
  return client;
};

describe('stale join after a reconnect (F1)', () => {
  beforeEach(() => {
    listeners.clear();
    presenceInRoom.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a join that times out after the socket dropped writes no backoff for the new connection', async () => {
    stubStore([ROOM]);
    const client = make();
    let fail!: (e: Error) => void;
    presenceInRoom.mockReturnValue(new Promise((_, rej) => (fail = rej)));
    const stale = client.ensureRoomPresence(ROOM, { timeoutMs: 5000 });
    await emit('disconnect');
    fail(new Error('presence_timeout:' + ROOM));
    expect(await stale).toBe(false);
    expect(client.roomPresenceBlockedUntil.has(ROOM)).toBe(false);
    expect(client.joinedRooms.has(ROOM)).toBe(false);
  });

  it('a stale success does not mark the room joined on the new connection', async () => {
    stubStore([ROOM]);
    const client = make();
    let ok!: () => void;
    presenceInRoom.mockReturnValue(new Promise<void>((res) => (ok = res)));
    const stale = client.ensureRoomPresence(ROOM, { timeoutMs: 5000 });
    await emit('disconnect');
    ok();
    expect(await stale).toBe(false);
    expect(client.joinedRooms.has(ROOM)).toBe(false);
  });

  it('a stale join finishing does not drop the new connection in-flight entry', async () => {
    stubStore([ROOM]);
    const client = make();
    let fail!: (e: Error) => void;
    presenceInRoom.mockReturnValueOnce(new Promise((_, rej) => (fail = rej)));
    const stale = client.ensureRoomPresence(ROOM, { timeoutMs: 5000 });
    await emit('disconnect');
    presenceInRoom.mockReturnValueOnce(new Promise(() => {}));
    void client.ensureRoomPresence(ROOM, { timeoutMs: 5000 });
    expect(client.roomPresenceInFlight.has(ROOM)).toBe(true);
    fail(new Error('presence_timeout'));
    await stale;
    expect(client.roomPresenceInFlight.has(ROOM)).toBe(true);
  });

  it('a fresh failure on the current connection still backs off', async () => {
    stubStore([ROOM]);
    const client = make();
    presenceInRoom.mockRejectedValue(new Error('presence_timeout'));
    expect(await client.ensureRoomPresence(ROOM, { timeoutMs: 5000 })).toBe(
      false
    );
    expect(client.roomPresenceBlockedUntil.get(ROOM)).toBeGreaterThan(
      Date.now()
    );
  });

  it('disconnect(): clears blocked-until together with joinedRooms', async () => {
    stubStore([ROOM]);
    const client = make();
    client.joinedRooms.add(ROOM2);
    client.roomPresenceBlockedUntil.set(ROOM, Date.now() + 10000);
    await emit('disconnect');
    expect(client.joinedRooms.size).toBe(0);
    expect(client.roomPresenceBlockedUntil.size).toBe(0);
  });
});

describe('sweep retries rooms left unjoined (F1)', () => {
  beforeEach(() => {
    listeners.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries after the block expires and joins the room', async () => {
    stubStore([ROOM]);
    const client = make();
    client.roomPresenceBlockedUntil.set(ROOM, Date.now() + 10000);
    const spy = vi
      .spyOn(client, 'allRoomPresencesStanza')
      .mockResolvedValueOnce({
        total: 1,
        success: 0,
        failed: 1,
        failedRooms: [ROOM],
        sweptRooms: [ROOM],
      } as any)
      .mockResolvedValueOnce({
        total: 1,
        success: 1,
        failed: 0,
        failedRooms: [],
        sweptRooms: [ROOM],
      } as any);
    await client.sendAllPresencesAndMarkReady();
    expect(spy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(9000);
    expect(spy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(client.joinedRooms.has(ROOM)).toBe(true);
    // Nothing left: no more rounds.
    await vi.advanceTimersByTimeAsync(60000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('is bounded to three rounds', async () => {
    stubStore([ROOM]);
    const client = make();
    const spy = vi
      .spyOn(client, 'allRoomPresencesStanza')
      .mockResolvedValue({
        total: 1,
        success: 0,
        failed: 1,
        failedRooms: [ROOM],
        sweptRooms: [ROOM],
      } as any);
    await client.sendAllPresencesAndMarkReady();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(spy).toHaveBeenCalledTimes(1 + 3);
  });

  it('does not retry rooms under a long (hard) block', async () => {
    stubStore([ROOM]);
    const client = make();
    client.roomPresenceBlockedUntil.set(ROOM, Date.now() + 60 * 60 * 1000);
    const spy = vi
      .spyOn(client, 'allRoomPresencesStanza')
      .mockResolvedValue(emptySummary as any);
    await client.sendAllPresencesAndMarkReady();
    await vi.advanceTimersByTimeAsync(60000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a disconnect cancels the pending retry', async () => {
    stubStore([ROOM]);
    const client = make();
    const spy = vi
      .spyOn(client, 'allRoomPresencesStanza')
      .mockResolvedValue({
        total: 1,
        success: 0,
        failed: 1,
        failedRooms: [ROOM],
        sweptRooms: [ROOM],
      } as any);
    await client.sendAllPresencesAndMarkReady();
    expect(client.sweepRetryTimer).not.toBeNull();
    await emit('disconnect');
    expect(client.sweepRetryTimer).toBeNull();
    await vi.advanceTimersByTimeAsync(60000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
