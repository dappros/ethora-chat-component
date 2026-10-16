import { describe, expect, it } from 'vitest';
import reducer, { addRoom, setReceivedWatermark } from './roomsSlice';
import { IRoom } from '../types/types';

const ROOM_JID = 'room1@conference.example.com';
const makeRoom = (): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages: ['m1', 'm2', 'm3'].map((id) => ({
      id,
      body: id,
      date: new Date().toISOString(),
      user: { id: 'alice', name: 'Alice' },
    })),
    isLoading: false,
    roomBg: null,
  }) as unknown as IRoom;

const watermark = (state: any, user: string) =>
  state.rooms[ROOM_JID].lastReceivedByUser?.[user];

describe('roomsSlice setReceivedWatermark', () => {
  it('records the delivery watermark per user', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      setReceivedWatermark({ roomJID: ROOM_JID, xmppUsername: 'bob', messageId: 'm2' })
    );
    expect(watermark(state, 'bob')).toBe('m2');
  });

  it('does not move a watermark backwards when both positions are loaded', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      setReceivedWatermark({ roomJID: ROOM_JID, xmppUsername: 'bob', messageId: 'm3' })
    );
    state = reducer(
      state,
      setReceivedWatermark({ roomJID: ROOM_JID, xmppUsername: 'bob', messageId: 'm1' })
    );
    expect(watermark(state, 'bob')).toBe('m3');
  });

  it.each(['__proto__', 'constructor', 'prototype'])(
    'ignores the unsafe username %s',
    (name) => {
      let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
      const before = state;
      state = reducer(
        state,
        setReceivedWatermark({ roomJID: ROOM_JID, xmppUsername: name, messageId: 'm1' })
      );
      expect(state.rooms[ROOM_JID].lastReceivedByUser).toBeUndefined();
      expect(state).toBe(before);
      expect(({} as any)[name]).not.toBe('m1');
    }
  );

  it('ignores unsafe room keys', () => {
    const state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    const next = reducer(
      state,
      setReceivedWatermark({ roomJID: '__proto__', xmppUsername: 'bob', messageId: 'm1' })
    );
    expect(next).toBe(state);
    expect(({} as any).bob).toBeUndefined();
  });

  it('does not move a watermark backwards when the ids are not loaded but encode a time', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      setReceivedWatermark({ roomJID: ROOM_JID, xmppUsername: 'bob', messageId: '1791180018286418' })
    );
    state = reducer(
      state,
      setReceivedWatermark({ roomJID: ROOM_JID, xmppUsername: 'bob', messageId: '1791180000000000' })
    );
    expect(watermark(state, 'bob')).toBe('1791180018286418');
  });
});
