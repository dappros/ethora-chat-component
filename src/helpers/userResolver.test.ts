import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('../networking/apiClient', () => ({
  default: { get },
  setBaseURL: vi.fn(),
}));

import { setUserLookupRoute } from '../networking/api-requests/roomMembers.api';
import { store } from '../roomStore';
import { setUser } from '../roomStore/chatSettingsSlice';
import {
  addRoom,
  insertUsers,
  setLogoutState,
  updateUsersSet,
} from '../roomStore/roomsSlice';
import {
  ensureRoomDirectory,
  getRoomDirectoryMembers,
  getRoomDirectoryState,
  getUserLookupStatus,
  isUserNotFound,
  requestSendersOf,
  requestUsers,
  resetUserResolver,
} from './userResolver';

const APP = '646cc8dc96d4a4dc8f7b2f2d';
const uid = (n: number) => `${APP}_${String(n).padStart(24, '0')}`;
const ok = (n: number) => ({
  data: {
    success: true,
    result: {
      _id: String(n),
      xmppUsername: uid(n),
      firstName: `F${n}`,
      lastName: `L${n}`,
      email: `u${n}@x.test`,
      tags: ['secret'],
      profileImage: '',
    },
  },
});
const notFound = () => Promise.reject({ response: { status: 404 } });
const usersSet = () => (store.getState() as any).rooms.usersSet;
const singleCalls = () =>
  get.mock.calls.filter(([, cfg]) => cfg?.params?.xmppUsername);

beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset();
  resetUserResolver();
  // these tests exercise the resolver, not the route chain (see the
  // 'single lookup routes' block below)
  setUserLookupRoute('v2');
  store.dispatch(
    setUser({
      _id: 'me',
      token: 'tok',
      xmppUsername: `${APP}_me`,
      appId: APP,
    } as any)
  );
  store.dispatch(setLogoutState());
});
afterEach(() => {
  setUserLookupRoute(null);
  vi.useRealTimers();
});

describe('requestUsers reserved names', () => {
  it('sends 0 requests for ids ending in a reserved object name', async () => {
    requestUsers([
      `${APP}___proto__`,
      `${APP}_constructor`,
      `${APP}_hasOwnProperty`,
      `${APP}_prototype`,
      `${APP}_toString`,
      `${APP}_valueOf`,
      `${APP}_${'a'.repeat(24)}___proto__`,
    ]);
    await vi.advanceTimersByTimeAsync(500);
    expect(get).not.toHaveBeenCalled();
    expect(({} as any).polluted).toBeUndefined();
  });
  it('still looks up uuid style ids', async () => {
    get.mockResolvedValue(ok(1));
    requestUsers([`${APP}_123e4567-e89b-12d3-a456-426614174000`]);
    await vi.advanceTimersByTimeAsync(300);
    expect(get).toHaveBeenCalled();
  });
});

describe('requestUsers', () => {
  it('debounces a burst into one pass and de-duplicates ids and JIDs', async () => {
    get.mockImplementation((_u, cfg) =>
      Promise.resolve(ok(Number(cfg.params.xmppUsername.slice(-3)) || 1))
    );
    requestUsers([uid(1)]);
    requestUsers([`${uid(1)}@xmpp.host/res`, uid(2)]);
    requestUsers([uid(1)]);
    expect(get).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(singleCalls().length).toBe(2);
    expect(singleCalls().map(([, c]) => c.params.xmppUsername).sort()).toEqual(
      [uid(1), uid(2)].sort()
    );
  });

  it('skips ids already in usersSet and plain handles', async () => {
    store.dispatch(
      insertUsers({
        newUsers: [
          { _id: '1', xmppUsername: uid(1), firstName: 'A', lastName: 'B' },
        ],
      })
    );
    requestUsers([uid(1), 'alice', 'undefined']);
    await vi.advanceTimersByTimeAsync(300);
    expect(get).not.toHaveBeenCalled();
  });

  it('runs at most 4 requests at once', async () => {
    let live = 0;
    let max = 0;
    get.mockImplementation(async (_u, cfg) => {
      live++;
      max = Math.max(max, live);
      await new Promise((r) => setTimeout(r, 50));
      live--;
      return ok(Number(cfg.params.xmppUsername.slice(-3)));
    });
    requestUsers([1, 2, 3, 4, 5, 6, 7, 8].map(uid));
    await vi.advanceTimersByTimeAsync(1000);
    expect(singleCalls().length).toBe(8);
    expect(max).toBe(4);
  });

  it('stores only display fields and writes results as one batch', async () => {
    get.mockImplementation((_u, cfg) =>
      Promise.resolve(ok(Number(cfg.params.xmppUsername.slice(-3))))
    );
    requestUsers([uid(1), uid(2), uid(3)]);
    await vi.advanceTimersByTimeAsync(500);
    const entry = usersSet()[uid(1)];
    expect(entry.firstName).toBe('F1');
    expect(entry.email).toBeUndefined();
    expect(entry.tags).toBeUndefined();
    expect(Object.keys(usersSet())).toHaveLength(3);
  });

  it('negative-caches a 404 for 10 minutes and flags it as not found', async () => {
    get.mockImplementation(notFound);
    requestUsers([uid(5)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(get).toHaveBeenCalledTimes(1);
    expect(isUserNotFound(uid(5))).toBe(true);
    requestUsers([uid(5)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1000);
    expect(isUserNotFound(uid(5))).toBe(false);
    requestUsers([uid(5)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('backs off 5s then 30s on server errors, and does not call it not found', async () => {
    get.mockImplementation(() => Promise.reject({ response: { status: 503 } }));
    requestUsers([uid(6)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(get).toHaveBeenCalledTimes(1);
    expect(isUserNotFound(uid(6))).toBe(false);
    requestUsers([uid(6)]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    requestUsers([uid(6)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(get).toHaveBeenCalledTimes(2);
    // second failure: 30s
    await vi.advanceTimersByTimeAsync(10_000);
    requestUsers([uid(6)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(get).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(25_000);
    requestUsers([uid(6)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('caps the pending queue at 200, dropping the oldest', async () => {
    get.mockImplementation((_u, cfg) =>
      Promise.resolve(ok(Number(cfg.params.xmppUsername.slice(-3))))
    );
    const ids = Array.from({ length: 250 }, (_, i) => uid(i + 1));
    requestUsers(ids);
    await vi.advanceTimersByTimeAsync(5000);
    const asked = new Set(singleCalls().map(([, c]) => c.params.xmppUsername));
    expect(asked.size).toBe(200);
    expect(asked.has(uid(1))).toBe(false);
    expect(asked.has(uid(250))).toBe(true);
  });

  it('ignores results that land after a reset (logout)', async () => {
    let resolveIt: (v: unknown) => void = () => {};
    get.mockImplementation(
      () => new Promise((r) => (resolveIt = r))
    );
    requestUsers([uid(7)]);
    await vi.advanceTimersByTimeAsync(300);
    resetUserResolver();
    resolveIt(ok(7));
    await vi.advanceTimersByTimeAsync(500);
    expect(usersSet()[uid(7)]).toBeUndefined();
  });

  it('requestSendersOf asks for every distinct sender of a batch', async () => {
    get.mockImplementation((_u, cfg) =>
      Promise.resolve(ok(Number(cfg.params.xmppUsername.slice(-3))))
    );
    requestSendersOf([
      { user: { id: `${uid(1)}@xmpp.host` } },
      { user: { id: uid(1) } },
      { user: { id: uid(2) } },
      { user: {} },
      null,
    ]);
    await vi.advanceTimersByTimeAsync(300);
    expect(singleCalls().length).toBe(2);
  });

  it('fetches a room directory once when more than 10 unknown senders sit in a room with missing members', async () => {
    const jid = `${APP}_chat1@conference.xmpp.host`;
    store.dispatch(
      addRoom({
        roomData: {
          jid,
          name: 'big',
          title: 'big',
          usersCnt: 435,
          members: [],
          messages: Array.from({ length: 12 }, (_, i) => ({
            id: `m${i}`,
            body: 'x',
            date: new Date().toISOString(),
            roomJid: jid,
            user: { id: uid(i + 1) },
          })),
          isLoading: false,
          roomBg: null,
        } as any,
      })
    );
    get.mockImplementation((_u, cfg) => {
      if (cfg.params.chatName) {
        return Promise.resolve({
          data: {
            items: Array.from({ length: 12 }, (_, i) => ok(i + 1).data.result),
            total: 12,
          },
        });
      }
      return Promise.reject({ response: { status: 404 } });
    });
    requestUsers(Array.from({ length: 12 }, (_, i) => uid(i + 1)));
    await vi.advanceTimersByTimeAsync(1000);
    expect(
      get.mock.calls.filter(([, c]) => c.params.chatName).length
    ).toBe(1);
    expect(singleCalls().length).toBe(0);
    expect(usersSet()[uid(12)].firstName).toBe('F12');
  });
});

describe('ensureRoomDirectory', () => {
  const jid = `${APP}_dir@conference.xmpp.host`;
  const item = (n: number) => ok(n).data.result;

  it('pages by items received, tolerates short pages, stops on an empty page', async () => {
    const pages: Record<number, any[]> = {
      0: [item(1), item(2), item(3)], // short page (limit 500)
      3: [item(4), item(5)],
      5: [],
    };
    get.mockImplementation((_u, cfg) =>
      Promise.resolve({
        data: { items: pages[cfg.params.offset] ?? [], total: 99 },
      })
    );
    await ensureRoomDirectory(jid);
    const offsets = get.mock.calls.map(([, c]) => c.params.offset);
    expect(offsets).toEqual([0, 3, 5]);
    expect(get.mock.calls[0][1].params).toMatchObject({
      chatName: `${APP}_dir`,
      limit: 500,
    });
    expect(Object.keys(usersSet())).toHaveLength(5);
    expect(getRoomDirectoryState(jid)).toBe('done');
  });

  it('dedupes the real 435/11/3/1 overlapping page shape and stops at total', async () => {
    const uniq = Array.from({ length: 435 }, (_, i) => item(i + 1));
    const pages: Record<number, any[]> = {
      0: uniq,
      435: uniq.slice(0, 11),
      446: uniq.slice(0, 3),
      449: uniq.slice(0, 1),
    };
    get.mockImplementation((_u, cfg) =>
      Promise.resolve({
        data: { items: pages[cfg.params.offset] ?? [], total: 450 },
      })
    );
    await ensureRoomDirectory(jid);
    expect(get.mock.calls.map(([, c]) => c.params.offset)).toEqual([0, 435, 446, 449]);
    const members = getRoomDirectoryMembers(jid);
    expect(members).toHaveLength(435);
    expect(new Set(members.map((m) => m.xmppUsername)).size).toBe(435);
    expect(getRoomDirectoryState(jid)).toBe('done');
  });

  it('does not loop when a page brings nothing new', async () => {
    get.mockImplementation(() =>
      Promise.resolve({ data: { items: [item(1), item(2)], total: 999 } })
    );
    await ensureRoomDirectory(jid);
    expect(get).toHaveBeenCalledTimes(6);
    expect(getRoomDirectoryMembers(jid)).toHaveLength(2);
  });

  it('stops at offset >= total, never stores email or tags, and loads once', async () => {
    get.mockImplementation(() =>
      Promise.resolve({ data: { items: [item(1), item(2)], total: 2 } })
    );
    const a = ensureRoomDirectory(jid);
    const b = ensureRoomDirectory(jid);
    await Promise.all([a, b]);
    expect(get).toHaveBeenCalledTimes(1);
    await ensureRoomDirectory(jid);
    expect(get).toHaveBeenCalledTimes(1);
    const e = usersSet()[uid(1)];
    expect(e.email).toBeUndefined();
    expect(e.tags).toBeUndefined();
  });

  it('reports error, does not hammer a failing directory, and retries after 30s', async () => {
    get.mockImplementationOnce(() => Promise.reject({ response: { status: 500 } }));
    await ensureRoomDirectory(jid);
    expect(getRoomDirectoryState(jid)).toBe('error');
    await ensureRoomDirectory(jid);
    expect(get).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(31_000);
    get.mockImplementation(() =>
      Promise.resolve({ data: { items: [item(1)], total: 1 } })
    );
    await ensureRoomDirectory(jid);
    expect(getRoomDirectoryState(jid)).toBe('done');
  });
});

describe('updateUsersSet merge', () => {
  const member = (n: number, first = `F${n}`) => ({
    _id: String(n),
    xmppUsername: uid(n),
    firstName: first,
    lastName: 'L',
  });
  const payload = (members: any[]) =>
    updateUsersSet({ rooms: [{ members }] as any });

  it('keeps lazily fetched users and lets fresh entries win', () => {
    store.dispatch(insertUsers({ newUsers: [member(1), member(2, 'Old')] }));
    store.dispatch(payload([member(2, 'New'), member(3)]));
    expect(usersSet()[uid(1)].firstName).toBe('F1');
    expect(usersSet()[uid(2)].firstName).toBe('New');
    expect(usersSet()[uid(3)]).toBeTruthy();
  });

  it('caps the set at 5000, dropping the least recently inserted', () => {
    store.dispatch(
      payload(Array.from({ length: 5100 }, (_, i) => member(i + 1)))
    );
    const keys = Object.keys(usersSet());
    expect(keys).toHaveLength(5000);
    expect(usersSet()[uid(1)]).toBeUndefined();
    expect(usersSet()[uid(5100)]).toBeTruthy();
  });

  it('ignores unsafe keys', () => {
    store.dispatch(
      payload([{ _id: 'x', xmppUsername: '__proto__', firstName: 'x', lastName: 'y' }])
    );
    expect(({} as any).firstName).toBeUndefined();
    expect(Object.keys(usersSet())).not.toContain('__proto__');
  });
});

describe('single lookup routes (v1 first, v2 fallback)', () => {
  const v1Calls = () =>
    get.mock.calls.filter(([url]) => String(url).startsWith('/v1/apps/users/'));
  const v2Calls = () =>
    get.mock.calls.filter(([url]) => url === '/v2/chats/users');
  const v1Ok = (n: number, extra: Record<string, unknown> = {}) => ({
    data: {
      result: {
        _id: String(n),
        xmppUsername: uid(n),
        firstName: `F${n}`,
        lastName: `L${n}`,
        description: 'bio',
        ...extra,
      },
    },
  });
  const reject = (status: number, data?: unknown) =>
    Promise.reject({ response: { status, data } });
  const idOf = (url: string) => decodeURIComponent(url.split('/').pop() || '');
  let v1Behaviour: (n: number) => Promise<unknown>;
  let v2Behaviour: (n: number) => Promise<unknown>;
  beforeEach(() => {
    setUserLookupRoute(null);
    v1Behaviour = (n) => Promise.resolve(v1Ok(n));
    v2Behaviour = (n) => Promise.resolve(ok(n));
    get.mockImplementation((url: string, cfg: any) =>
      String(url).startsWith('/v1/')
        ? v1Behaviour(Number(idOf(url).slice(-3)))
        : v2Behaviour(Number(cfg.params.xmppUsername.slice(-3)))
    );
  });
  const lookup = async (...ns: number[]) => {
    requestUsers(ns.map(uid));
    await vi.advanceTimersByTimeAsync(400);
  };

  it('v1 answering 200 never touches v2 and stores display fields only', async () => {
    await lookup(1, 2, 3);
    expect(v1Calls().length).toBe(3);
    expect(v2Calls().length).toBe(0);
    expect(v1Calls()[0][1].headers.Authorization).toBe('tok');
    const entry = usersSet()[uid(1)];
    expect(entry).toEqual({
      _id: '1',
      xmppUsername: uid(1),
      firstName: 'F1',
      lastName: 'L1',
    });
  });

  it('reads the item/data result wrappers too', async () => {
    v1Behaviour = (n) =>
      Promise.resolve({
        data: { item: { xmppUsername: uid(n), firstName: 'Wrapped', lastName: '' } },
      });
    await lookup(7);
    expect(usersSet()[uid(7)].firstName).toBe('Wrapped');
  });

  it('v1 400 falls back to v2 after ONE v1 probe, then skips v1 for the TTL', async () => {
    v1Behaviour = () => reject(400, { message: 'Invalid token type' });
    await lookup(1, 2, 3, 4, 5, 6);
    expect(v1Calls().length).toBe(1);
    expect(v2Calls().length).toBe(6);
    expect(usersSet()[uid(6)].firstName).toBe('F6');
    await lookup(8, 9);
    expect(v1Calls().length).toBe(1);
    expect(v2Calls().length).toBe(8);
  });

  it('retries v1 after the 10 minute TTL and recovers when it works again', async () => {
    v1Behaviour = () => reject(400);
    await lookup(1);
    expect(v1Calls().length).toBe(1);
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    await lookup(2);
    expect(v1Calls().length).toBe(1);
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    v1Behaviour = (n) => Promise.resolve(v1Ok(n));
    await lookup(3);
    expect(v1Calls().length).toBe(2);
    expect(v2Calls().length).toBe(2);
    expect(usersSet()[uid(3)].firstName).toBe('F3');
    await lookup(4);
    expect(v1Calls().length).toBe(3);
    expect(v2Calls().length).toBe(2);
  });

  it('401 and a 404 that is not USER_NOT_FOUND also mean the route is unsupported', async () => {
    v1Behaviour = () => reject(401);
    await lookup(1);
    expect(v2Calls().length).toBe(1);
    resetUserResolver();
    get.mockClear();
    v1Behaviour = () => reject(404, 'Cannot GET /v1/apps/users/x');
    await lookup(2);
    expect(v2Calls().length).toBe(1);
    expect(usersSet()[uid(2)].firstName).toBe('F2');
  });

  it('403 is a per-user forbidden: no v2 call, route stays supported, 10 min cache', async () => {
    v1Behaviour = (n) => (n === 1 ? reject(403) : Promise.resolve(v1Ok(n)));
    await lookup(1, 2);
    expect(v2Calls().length).toBe(0);
    expect(usersSet()[uid(1)]).toBeUndefined();
    expect(usersSet()[uid(2)].firstName).toBe('F2');
    expect(getUserLookupStatus(uid(1))).toBe('forbidden');
    expect(isUserNotFound(uid(1))).toBe(false);
    await lookup(1, 3);
    expect(v1Calls().map(([u]) => idOf(u))).toEqual([uid(1), uid(2), uid(3)]);
    await vi.advanceTimersByTimeAsync(11 * 60_000);
    await lookup(1);
    expect(v1Calls().length).toBe(4);
  });

  it('404 USER_NOT_FOUND on v1 is a per-user notfound, not a route problem', async () => {
    v1Behaviour = () => reject(404, { code: 'USER_NOT_FOUND' });
    await lookup(5);
    expect(isUserNotFound(uid(5))).toBe(true);
    expect(getUserLookupStatus(uid(5))).toBe('notfound');
    expect(v2Calls().length).toBe(0);
  });

  it('5xx on v1 keeps the existing backoff and does not switch routes', async () => {
    v1Behaviour = () => reject(503);
    await lookup(5);
    expect(v1Calls().length).toBe(1);
    expect(v2Calls().length).toBe(0);
    expect(getUserLookupStatus(uid(5))).toBe('failed');
    await lookup(5);
    expect(v1Calls().length).toBe(1);
    await vi.advanceTimersByTimeAsync(6_000);
    await lookup(5);
    expect(v1Calls().length).toBe(2);
  });

  it('never stores email or tags from v2, and v2 403 is forbidden', async () => {
    v1Behaviour = () => reject(400);
    await lookup(1);
    expect(usersSet()[uid(1)].email).toBeUndefined();
    expect(usersSet()[uid(1)].tags).toBeUndefined();
    v2Behaviour = () => reject(403);
    await lookup(2);
    expect(getUserLookupStatus(uid(2))).toBe('forbidden');
  });

  it('forget the learned route on account change', async () => {
    v1Behaviour = () => reject(400);
    await lookup(1);
    expect(v1Calls().length).toBe(1);
    store.dispatch(
      setUser({ _id: 'o', token: 'tok2', xmppUsername: `${APP}_other`, appId: APP } as any)
    );
    await lookup(2);
    expect(v1Calls().length).toBe(2);
  });

  it('config knob: v2 only / v1 only', async () => {
    setUserLookupRoute('v2');
    await lookup(1);
    expect(v1Calls().length).toBe(0);
    setUserLookupRoute('v1');
    v1Behaviour = () => reject(400);
    await lookup(2);
    expect(v2Calls().length).toBe(1);
    expect(getUserLookupStatus(uid(2))).toBe('failed');
  });

  it('getUserLookupStatus: pending then resolved, unavailable for plain handles', async () => {
    expect(getUserLookupStatus(uid(1))).toBe('pending');
    expect(getUserLookupStatus('alice')).toBe('unavailable');
    await lookup(1);
    expect(getUserLookupStatus(uid(1))).toBe('resolved');
  });
});
