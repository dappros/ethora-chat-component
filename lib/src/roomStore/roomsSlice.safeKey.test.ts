import { describe, expect, it } from 'vitest';
import reducer, {
  addRoom,
  addRoomMessage,
  insertUsers,
  setComposing,
  setMemberOffline,
  setMemberOnline,
  setMessageTranslation,
  setPushSubscriptionStatus,
  setReactions,
  setRoomDraft,
  setRoomMuted,
  setRoomRole,
  updateRoom,
  updateRooms,
} from './roomsSlice';
import { isSafeKey } from './safeKey';

const ROOM = 'room@conference.example.com';
const UNSAFE = ['__proto__', 'constructor', 'prototype'];
const clean = () => {
  expect(({} as any).polluted).toBeUndefined();
  expect(
    Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')
  ).toBe(false);
};
const withRoom = () =>
  reducer(
    reducer(undefined, { type: '@@INIT' }),
    addRoom({
      roomData: {
        jid: ROOM,
        title: 'r',
        messages: [
          {
            id: '1',
            body: 'a',
            date: new Date().toISOString(),
            user: { id: 'u' },
          },
        ],
      } as any,
    })
  );

describe('isSafeKey', () => {
  it('rejects unsafe and non-string keys', () => {
    for (const k of [...UNSAFE, '', undefined, null, 1, {}]) {
      expect(isSafeKey(k)).toBe(false);
    }
    expect(isSafeKey(ROOM)).toBe(true);
    expect(isSafeKey('alice')).toBe(true);
  });
});

describe('reducers ignore unsafe dynamic keys', () => {
  it.each(UNSAFE)('room-keyed reducers with %s', (bad) => {
    const start = withRoom();
    let s = start;
    expect(() => {
      s = reducer(s, setComposing({ chatJID: bad, composing: true } as any));
      s = reducer(s, setRoomRole({ chatJID: bad, role: 'polluted' }));
      s = reducer(s, setRoomMuted({ jid: bad, muted: true }));
      s = reducer(s, updateRoom({ jid: bad, updates: { polluted: 1 } as any }));
      s = reducer(
        s,
        updateRooms([{ jid: bad, updates: { polluted: 1 } as any }])
      );
      s = reducer(s, setRoomDraft({ jid: bad, text: 'x' }));
      s = reducer(s, setMemberOnline({ roomJID: bad, xmppUsername: 'u' }));
      s = reducer(s, setMemberOffline({ roomJID: bad, xmppUsername: 'u' }));
      s = reducer(
        s,
        setPushSubscriptionStatus({ jid: bad, status: 'pending' })
      );
      s = reducer(
        s,
        addRoomMessage({
          roomJID: bad,
          message: { id: '2', body: 'x', date: '', user: { id: 'u' } },
        } as any)
      );
      s = reducer(
        s,
        addRoom({ roomData: { jid: `${bad}`, title: 'x' } as any })
      );
    }).not.toThrow();
    expect(Object.keys(s.rooms)).toEqual([ROOM]);
    expect(s.pushSubscriptionStatus).toEqual({});
    expect(s.presenceByRoom).toEqual({});
    clean();
  });

  it.each(UNSAFE)('user and message-keyed maps with %s', (bad) => {
    let s = withRoom();
    expect(() => {
      s = reducer(
        s,
        insertUsers({
          newUsers: [{ xmppUsername: bad, firstName: 'p' } as any],
        })
      );
      s = reducer(
        s,
        setReactions({
          roomJID: ROOM,
          messageId: '1',
          reactions: ['x'],
          from: `${bad}@host`,
        } as any)
      );
      s = reducer(
        s,
        setMessageTranslation({
          roomJID: ROOM,
          messageId: '1',
          locale: bad,
          entry: { polluted: 1 } as any,
        })
      );
    }).not.toThrow();
    expect(Object.keys(s.usersSet)).toEqual([]);
    expect(s.rooms[ROOM].messages[0].reaction).toBeUndefined();
    expect(s.rooms[ROOM].messages[0].translations).toBeUndefined();
    clean();
  });

  it('deepMerge on an echo does not follow a __proto__ key', () => {
    const s0 = withRoom();
    const payload = JSON.parse(
      '{"id":"1","body":"a","date":"","user":{"id":"u"},"__proto__":{"polluted":true},"extra":{"__proto__":{"polluted":true}}}'
    );
    expect(() =>
      reducer(s0, addRoomMessage({ roomJID: ROOM, message: payload } as any))
    ).not.toThrow();
    clean();
  });

  it('safe keys still work', () => {
    let s = withRoom();
    s = reducer(s, setRoomRole({ chatJID: ROOM, role: 'moderator' }));
    s = reducer(
      s,
      insertUsers({
        newUsers: [{ xmppUsername: 'alice', firstName: 'A' } as any],
      })
    );
    expect(s.rooms[ROOM].role).toBe('moderator');
    expect(s.usersSet.alice).toBeDefined();
  });
});
