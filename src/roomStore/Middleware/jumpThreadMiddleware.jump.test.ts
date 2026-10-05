import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import roomsSlice, {
  addRoom,
  setRoomMessages,
  setActiveMessage,
  requestJumpToMessage,
  setCurrentRoom,
} from '../roomsSlice';
import { jumpThreadMiddleware } from './jumpThreadMiddleware';
import { clearJumpThread, getJumpThread, JUMP_TTL_MS } from '../../helpers/jumpThread';

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
const reply = (n: number, parent: any) =>
  mk(n, {
    isReply: 'true',
    mainMessage: JSON.stringify({ id: parent.id, roomJid: ROOM }),
  });

const P1 = mk(1);
const P2 = mk(2);
const MAIN = mk(3);
const R1 = reply(4, P1);
const R2 = reply(5, P2);

const setup = () => {
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
  store.dispatch(
    setRoomMessages({ roomJID: ROOM, messages: [P1, P2, MAIN, R1, R2] })
  );
  store.dispatch(setActiveMessage({ id: P1.id, chatJID: ROOM }));
  return store;
};
const rooms = (store: any) => store.getState().rooms;
const openId = (store: any) =>
  rooms(store).rooms[ROOM].messages.find((m: any) => m.activeMessage)?.id;
const jumpTo = (m: any) =>
  requestJumpToMessage({ roomJID: ROOM, ids: [m.id] });

describe('jump while a thread is open', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearJumpThread();
  });
  afterEach(() => vi.useRealTimers());

  it('closes the thread for a main-list target and keeps the jump pending', () => {
    const store = setup();
    expect(openId(store)).toBe(P1.id);
    store.dispatch(jumpTo(MAIN));
    expect(openId(store)).toBeUndefined();
    expect(rooms(store).pendingJump?.ids).toEqual([MAIN.id]);
  });

  it('keeps the thread for a reply of the same parent', () => {
    const store = setup();
    store.dispatch(jumpTo(R1));
    expect(openId(store)).toBe(P1.id);
    expect(getJumpThread()?.parentId).toBe(P1.id);
    expect(getJumpThread()?.at).toBe(rooms(store).pendingJump?.at);
  });

  it('closes the thread for a reply of another parent so the main list resolves it', () => {
    const store = setup();
    store.dispatch(jumpTo(R2));
    expect(openId(store)).toBeUndefined();
    expect(rooms(store).pendingJump?.ids).toEqual([R2.id]);
  });

  it('does nothing to a closed state when no thread is open', () => {
    const store = setup();
    store.dispatch({
      type: 'roomMessages/setCloseActiveMessage',
      payload: { chatJID: ROOM },
    });
    store.dispatch(jumpTo(MAIN));
    expect(rooms(store).pendingJump).toBeTruthy();
  });

  it('drops an unowned request after the TTL without the archived card when the message is live', () => {
    const store = setup();
    store.dispatch(jumpTo(MAIN));
    vi.advanceTimersByTime(JUMP_TTL_MS + 6000);
    expect(rooms(store).pendingJump).toBeNull();
    expect(rooms(store).archivedMessage ?? null).toBeNull();
  });

  it('shows the archived preview after the TTL only when the message is not live', () => {
    const store = setup();
    const preview = { id: 'gone', body: 'old', date: 'x' } as any;
    store.dispatch(
      requestJumpToMessage({ roomJID: ROOM, ids: ['gone'], preview })
    );
    vi.advanceTimersByTime(JUMP_TTL_MS + 6000);
    expect(rooms(store).pendingJump).toBeNull();
    expect(rooms(store).archivedMessage).toBeTruthy();
  });
});

describe('setCurrentRoom safe keys', () => {
  it.each(['__proto__', 'constructor', 'prototype'])('ignores %s', (jid) => {
    const store = setup();
    store.dispatch(setCurrentRoom({ roomJID: ROOM }));
    store.dispatch(setCurrentRoom({ roomJID: jid }));
    expect(rooms(store).activeRoomJID).toBe(ROOM);
    store.dispatch(setCurrentRoom({ roomJID: null }));
    expect(rooms(store).activeRoomJID).toBeNull();
  });
});
