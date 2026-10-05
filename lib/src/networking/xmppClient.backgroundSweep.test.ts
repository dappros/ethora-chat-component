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

import { store } from '../roomStore';
import { XmppClient } from './xmppClient';

const ROOM = 'a@conference.example.com';
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

describe('XmppClient background join sweep', () => {
  beforeEach(() => {
    listeners.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('a sweep over rooms that never answer does not mark ready until it ends', async () => {
    stubStore([ROOM]);
    const client = new XmppClient('u', 'p') as any;
    let finish!: (v: any) => void;
    vi.spyOn(client, 'allRoomPresencesStanza').mockReturnValue(
      new Promise((r) => (finish = r)) as any
    );
    const sweep = client.sendAllPresencesAndMarkReady();
    expect(client.presencesReady).toBe(false);
    finish({ total: 1, success: 1, failed: 0, failedRooms: [], sweptRooms: [ROOM] });
    await sweep;
    expect(client.presencesReady).toBe(true);
    expect(client.priorityPresencesReady).toBe(true);
    expect(client.joinedRooms.has(ROOM)).toBe(true);
  });

  it('shares one in-flight sweep between callers', async () => {
    stubStore([ROOM]);
    const client = new XmppClient('u', 'p') as any;
    const spy = vi
      .spyOn(client, 'allRoomPresencesStanza')
      .mockResolvedValue({ total: 0, success: 0, failed: 0, failedRooms: [], sweptRooms: [] } as any);
    await Promise.all([
      client.sendAllPresencesAndMarkReady(),
      client.sendAllPresencesAndMarkReady(),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a late caller sweeps again only when unjoined rooms exist', async () => {
    const getState = stubStore([ROOM]);
    const client = new XmppClient('u', 'p') as any;
    const spy = vi
      .spyOn(client, 'allRoomPresencesStanza')
      .mockResolvedValue({ total: 1, success: 1, failed: 0, failedRooms: [], sweptRooms: [ROOM] } as any);
    await client.sendAllPresencesAndMarkReady();
    await client.sendAllPresencesAndMarkReady();
    expect(spy).toHaveBeenCalledTimes(1);
    getState.mockReturnValue({
      rooms: { rooms: { [ROOM]: {}, 'b@conference.example.com': {} }, activeRoomJID: '' },
    } as any);
    await client.sendAllPresencesAndMarkReady();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('a disconnect mid-sweep cancels it: stale sweep marks nothing ready or joined', async () => {
    stubStore([ROOM]);
    const client = new XmppClient('u', 'p') as any;
    client.attachEventListeners();
    let finish!: (v: any) => void;
    vi.spyOn(client, 'allRoomPresencesStanza').mockReturnValue(
      new Promise((r) => (finish = r)) as any
    );
    const stale = client.sendAllPresencesAndMarkReady();
    await emit('disconnect');
    // The new connection starts its own sweep rather than joining the stale one.
    const spy2 = vi
      .spyOn(client, 'allRoomPresencesStanza')
      .mockResolvedValue({ total: 0, success: 0, failed: 0, failedRooms: [], sweptRooms: [] } as any);
    const fresh = client.sendAllPresencesAndMarkReady();
    expect(spy2).toHaveBeenCalledTimes(1);
    finish({ total: 1, success: 1, failed: 0, failedRooms: [], sweptRooms: [ROOM] });
    await stale;
    expect(client.joinedRooms.has(ROOM)).toBe(false);
    await fresh;
    expect(client.presencesReady).toBe(true);
  });

  it('priorityPresencesReady is reset on disconnect and reconnect()', async () => {
    stubStore([]);
    const client = new XmppClient('u', 'p') as any;
    client.attachEventListeners();
    client.priorityPresencesReady = true;
    await emit('disconnect');
    expect(client.priorityPresencesReady).toBe(false);
  });
});
