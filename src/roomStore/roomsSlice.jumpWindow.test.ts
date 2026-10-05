import { describe, expect, it } from 'vitest';
import reducer, {
  JUMP_WINDOW_MAX_MESSAGES,
  appendJumpWindowMessages,
  clearJumpWindow,
  prependJumpWindowMessages,
  setJumpWindow,
  setLogoutState,
} from './roomsSlice';

const ROOM = 'room@conference.example.com';
const msg = (n: number) =>
  ({
    id: String(1_000_000_000_000_000 + n * 1000),
    body: `m${n}`,
    date: new Date(1_700_000_000_000 + n * 1000).toISOString(),
    roomJid: ROOM,
    user: { id: 'u' },
  }) as any;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => msg(from + i));

const base = () => reducer(undefined, { type: '@@INIT' });
const open = (from = 100, to = 120) =>
  reducer(
    base(),
    setJumpWindow({
      roomJID: ROOM,
      messages: range(from, to),
      targetId: msg(110).id,
      olderCursor: Number(msg(from).id),
      hasOlder: true,
      newerCursor: Number(msg(to).id),
      hasNewer: true,
    })
  );

describe('jumpWindow reducer', () => {
  it('starts empty', () => {
    expect(base().jumpWindow).toBeNull();
  });

  it('sets a window without touching the live history', () => {
    const start = reducer(base(), {
      type: 'rooms/updateRoom',
      payload: {
        jid: ROOM,
        updates: {
          historyComplete: false,
          messageStats: { firstMessageTimestamp: 5, lastMessageTimestamp: 6 },
        },
      },
    });
    const state = reducer(
      start,
      setJumpWindow({
        roomJID: ROOM,
        messages: range(100, 110),
        targetId: msg(105).id,
        olderCursor: 1,
        hasOlder: true,
        newerCursor: 2,
        hasNewer: true,
      })
    );
    expect(state.jumpWindow?.messages).toHaveLength(11);
    expect(state.rooms).toBe(start.rooms);
  });

  it('prepends older messages in order, without duplicates', () => {
    const state = reducer(
      open(),
      prependJumpWindowMessages({
        roomJID: ROOM,
        messages: range(95, 101),
        olderCursor: Number(msg(95).id),
        hasOlder: false,
      })
    );
    const ids = state.jumpWindow!.messages.map((m) => m.id);
    expect(ids).toEqual(range(95, 120).map((m) => m.id));
    expect(state.jumpWindow!.hasOlder).toBe(false);
    expect(state.jumpWindow!.olderCursor).toBe(Number(msg(95).id));
    // the newer side is untouched
    expect(state.jumpWindow!.hasNewer).toBe(true);
  });

  it('appends newer messages and updates the newer cursor', () => {
    const state = reducer(
      open(),
      appendJumpWindowMessages({
        roomJID: ROOM,
        messages: range(121, 140),
        newerCursor: Number(msg(140).id),
        hasNewer: false,
      })
    );
    expect(state.jumpWindow!.messages).toHaveLength(41);
    expect(state.jumpWindow!.hasNewer).toBe(false);
    expect(state.jumpWindow!.newerCursor).toBe(Number(msg(140).id));
  });

  it('ignores pages for another room', () => {
    const start = open();
    const state = reducer(
      start,
      appendJumpWindowMessages({
        roomJID: 'other@conference.example.com',
        messages: range(121, 130),
        newerCursor: 1,
        hasNewer: false,
      })
    );
    expect(state.jumpWindow).toBe(start.jumpWindow);
  });

  it('trims the newest side when growing upward past the bound', () => {
    const start = open(1000, 1250); // 251
    const state = reducer(
      start,
      prependJumpWindowMessages({
        roomJID: ROOM,
        messages: range(950, 999), // +50 -> 301
        olderCursor: Number(msg(950).id),
        hasOlder: true,
      })
    );
    const win = state.jumpWindow!;
    expect(win.messages).toHaveLength(JUMP_WINDOW_MAX_MESSAGES);
    expect(win.messages[0].id).toBe(msg(950).id);
    expect(win.hasNewer).toBe(true);
    expect(win.newerCursor).toBe(
      Number(win.messages[win.messages.length - 1].id)
    );
  });

  it('trims the oldest side when growing downward past the bound', () => {
    const start = open(1000, 1250);
    const state = reducer(
      start,
      appendJumpWindowMessages({
        roomJID: ROOM,
        messages: range(1251, 1300), // 301
        newerCursor: Number(msg(1300).id),
        hasNewer: false,
      })
    );
    const win = state.jumpWindow!;
    expect(win.messages).toHaveLength(JUMP_WINDOW_MAX_MESSAGES);
    expect(win.messages[win.messages.length - 1].id).toBe(msg(1300).id);
    expect(win.hasOlder).toBe(true);
    expect(win.olderCursor).toBe(Number(win.messages[0].id));
  });

  it('clears, and logout clears it too', () => {
    expect(reducer(open(), clearJumpWindow()).jumpWindow).toBeNull();
    expect(reducer(open(), setLogoutState()).jumpWindow).toBeNull();
  });
});
