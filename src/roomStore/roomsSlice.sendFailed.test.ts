import { describe, expect, it } from 'vitest';
import reducer, { addRoom, setMessageSendFailed } from './roomsSlice';
import { IRoom } from '../types/types';

const ROOM_JID = 'room1@conference.example.com';

const makeRoom = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages: [
      {
        id: 'm1',
        body: 'media',
        date: new Date().toISOString(),
        user: { id: 'me', name: 'Me' },
        pending: true,
      },
    ],
    isLoading: false,
    roomBg: null,
    ...overrides,
  }) as IRoom;

describe('roomsSlice setMessageSendFailed', () => {
  it('marks the message failed and clears pending', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      setMessageSendFailed({ roomJID: ROOM_JID, messageId: 'm1' })
    );

    const message = state.rooms[ROOM_JID].messages.find((m) => m.id === 'm1');
    expect(message?.sendFailed).toBe(true);
    expect(message?.pending).toBe(false);
  });

  it('does nothing for an unknown message id', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      setMessageSendFailed({ roomJID: ROOM_JID, messageId: 'does-not-exist' })
    );

    const message = state.rooms[ROOM_JID].messages.find((m) => m.id === 'm1');
    expect(message?.sendFailed).toBeUndefined();
    expect(message?.pending).toBe(true);
  });

  it('does nothing for an unknown room', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    expect(() =>
      reducer(
        state,
        setMessageSendFailed({ roomJID: 'nope@conference.example.com', messageId: 'm1' })
      )
    ).not.toThrow();
  });
});
