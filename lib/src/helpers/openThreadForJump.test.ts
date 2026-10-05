import { describe, expect, it, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import roomsSlice, {
  addRoom,
  setRoomMessages,
  clearJumpWindow,
  setActiveMessage,
  setCloseActiveMessage,
  setJumpWindow,
} from '../roomStore/roomsSlice';
import { jumpThreadMiddleware } from '../roomStore/Middleware/jumpThreadMiddleware';
import { openThreadForJump } from './openThreadForJump';
import {
  clearJumpThread,
  getJumpThread,
  replyParentId,
} from './jumpThread';

const ROOM = 'room@conference.example.com';
const mk = (n: number, extra: Record<string, unknown> = {}) =>
  ({
    id: String(1_700_000_000_000_000 + n * 1000),
    body: `b${n}`,
    date: new Date(1_700_000_000_000 + n * 1000).toISOString(),
    roomJid: ROOM,
    user: { id: 'u' },
    ...extra,
  }) as any;
const reply = (n: number, parent: any, extra: Record<string, unknown> = {}) =>
  mk(n, {
    isReply: 'true',
    mainMessage: JSON.stringify({ id: parent.id, roomJid: ROOM }),
    ...extra,
  });

const makeStore = (live: any[]) => {
  const store = configureStore({
    reducer: { rooms: roomsSlice } as any,
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }).concat(
        jumpThreadMiddleware
      ),
  });
  store.dispatch(
    addRoom({ roomData: { jid: ROOM, messages: [], title: 'r' } as any })
  );
  if (live.length > 0) {
    store.dispatch(setRoomMessages({ roomJID: ROOM, messages: live }));
  }
  return store;
};

const windowOf = (messages: any[]) => ({
  roomJID: ROOM,
  messages,
  targetId: messages[0].id,
  olderCursor: null,
  hasOlder: false,
  newerCursor: null,
  hasNewer: false,
});

describe('replyParentId', () => {
  const p = mk(1);
  it('names the parent of a pure thread reply', () => {
    expect(replyParentId(reply(2, p))).toBe(p.id);
  });
  it('is null for a reply that is also shown in the channel, and for plain messages', () => {
    expect(replyParentId(reply(2, p, { showInChannel: 'true' }))).toBeNull();
    expect(replyParentId(mk(3))).toBeNull();
  });
});

describe('openThreadForJump', () => {
  beforeEach(() => clearJumpThread());

  it('flags a live parent and makes the thread the jump owner', async () => {
    const parent = mk(1);
    const r = reply(2, parent);
    const store = makeStore([parent, r]);
    const ok = await openThreadForJump({
      dispatch: store.dispatch as any,
      roomJID: ROOM,
      at: 77,
      reply: r,
      live: [parent, r],
    });
    expect(ok).toBe(true);
    const flagged = (store.getState() as any).rooms.rooms[ROOM].messages.find(
      (m: any) => m.activeMessage
    );
    expect(flagged?.id).toBe(parent.id);
    expect(getJumpThread()).toMatchObject({ at: 77, parentId: parent.id, parent: null });
    // the middleware leaves the thread the jump just opened alone
    expect(getJumpThread()).not.toBeNull();
  });

  it('keeps a parent that exists only next to the reply (not in the live list)', async () => {
    const parent = mk(1);
    const r = reply(2, parent);
    const store = makeStore([mk(50)]);
    const ok = await openThreadForJump({
      dispatch: store.dispatch as any,
      roomJID: ROOM,
      at: 5,
      reply: r,
      live: [mk(50)],
      nearby: [parent, r, reply(3, parent)],
    });
    expect(ok).toBe(true);
    const held = getJumpThread()!;
    expect(held.parent?.id).toBe(parent.id);
    expect(held.replies.map((m) => m.id)).toEqual([r.id, mk(3).id]);
  });

  it('loads a window around the parent when it is nowhere in memory', async () => {
    const parent = mk(1);
    const r = reply(900, parent);
    const client = {
      getHistoryWindow: vi.fn(async (_j: string, _m: number, cursor: any) =>
        cursor.before !== undefined
          ? { ok: true, messages: [], complete: true, first: null, last: null }
          : {
              ok: true,
              messages: [parent, reply(2, parent)],
              complete: true,
              first: Number(parent.id),
              last: Number(reply(2, parent).id),
            }
      ),
    };
    const store = makeStore([mk(1000)]);
    const ok = await openThreadForJump({
      client,
      dispatch: store.dispatch as any,
      roomJID: ROOM,
      at: 9,
      reply: r,
      live: [mk(1000)],
    });
    expect(ok).toBe(true);
    expect(getJumpThread()!.parent?.id).toBe(parent.id);
    expect(getJumpThread()!.replies.map((m) => m.id)).toContain(r.id);
    expect(getJumpThread()!.replies.map((m) => m.id)).toContain(reply(2, parent).id);
  });

  it('reports false when the parent cannot be found', async () => {
    const parent = mk(1);
    const client = {
      getHistoryWindow: vi.fn(async () => ({
        ok: true,
        messages: [],
        complete: true,
        first: null,
        last: null,
      })),
    };
    const store = makeStore([]);
    const ok = await openThreadForJump({
      client,
      dispatch: store.dispatch as any,
      roomJID: ROOM,
      at: 1,
      reply: reply(2, parent),
      live: [],
    });
    expect(ok).toBe(false);
    expect(getJumpThread()).toBeNull();
  });
});

describe('thread from a jump window (middleware)', () => {
  beforeEach(() => clearJumpThread());

  it('opening a thread on a window-only message records it for the panel', () => {
    const parent = mk(1);
    const r = reply(2, parent);
    const store = makeStore([mk(50)]);
    store.dispatch(setJumpWindow(windowOf([parent, r])));
    store.dispatch(setActiveMessage({ id: parent.id, chatJID: ROOM }));
    const held = getJumpThread()!;
    expect(held.parent?.id).toBe(parent.id);
    expect(held.replies.map((m) => m.id)).toEqual([r.id]);
  });

  it('a live parent keeps using the ordinary flag', () => {
    const parent = mk(1);
    const store = makeStore([parent]);
    store.dispatch(setActiveMessage({ id: parent.id, chatJID: ROOM }));
    expect(getJumpThread()).toBeNull();
  });

  it('closing the thread forgets the window copy', () => {
    const parent = mk(1);
    const store = makeStore([mk(50)]);
    store.dispatch(setJumpWindow(windowOf([parent])));
    store.dispatch(setActiveMessage({ id: parent.id, chatJID: ROOM }));
    store.dispatch(setCloseActiveMessage({ chatJID: ROOM }));
    expect(getJumpThread()).toBeNull();
  });

  it('clearing the window keeps the thread open from its copy when the parent is not live', () => {
    const parent = mk(1);
    const store = makeStore([mk(50)]);
    store.dispatch(setJumpWindow(windowOf([parent])));
    store.dispatch(setActiveMessage({ id: parent.id, chatJID: ROOM }));
    store.dispatch(clearJumpWindow());
    expect(getJumpThread()?.parent?.id).toBe(parent.id);
  });

  it('clearing the window hands the thread to the live flag when the parent is live', () => {
    const parent = mk(1);
    const store = makeStore([mk(50)]);
    store.dispatch(setJumpWindow(windowOf([parent])));
    store.dispatch(setActiveMessage({ id: parent.id, chatJID: ROOM }));
    // the parent reaches the live list meanwhile
    store.dispatch(setRoomMessages({ roomJID: ROOM, messages: [parent] }));
    store.dispatch(clearJumpWindow());
    expect(getJumpThread()).toBeNull();
    expect(
      (store.getState() as any).rooms.rooms[ROOM].messages.find(
        (m: any) => m.activeMessage
      )?.id
    ).toBe(parent.id);
  });
});
