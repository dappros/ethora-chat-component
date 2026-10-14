import { describe, expect, it } from 'vitest';
import reducer, {
  addRoom,
  setReceivedReceipt,
  setDisplayedMarker,
} from './roomsSlice';
import { IRoom } from '../types/types';

const ROOM_JID = 'room1@conference.example.com';

const makeRoom = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: ROOM_JID,
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages: [
      { id: 'm1', body: 'hi', date: new Date().toISOString(), user: { id: 'alice', name: 'Alice' } },
      { id: 'm2', body: 'yo', date: new Date().toISOString(), user: { id: 'alice', name: 'Alice' } },
    ],
    isLoading: false,
    roomBg: null,
    ...overrides,
  }) as IRoom;

describe('roomsSlice read receipts', () => {
  it('records a delivery receipt on the matching message', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      setReceivedReceipt({
        roomJID: ROOM_JID,
        messageId: 'm1',
        fromXmppUsername: 'bob',
        timestamp: 12345,
      })
    );

    const message = state.rooms[ROOM_JID].messages.find((m) => m.id === 'm1');
    expect(message?.receivedBy).toEqual({ bob: 12345 });
  });

  it('does not touch other messages when recording a receipt', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      setReceivedReceipt({
        roomJID: ROOM_JID,
        messageId: 'm1',
        fromXmppUsername: 'bob',
        timestamp: 12345,
      })
    );

    const other = state.rooms[ROOM_JID].messages.find((m) => m.id === 'm2');
    expect(other?.receivedBy).toBeUndefined();
  });

  it('ignores a receipt with no sender', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      setReceivedReceipt({
        roomJID: ROOM_JID,
        messageId: 'm1',
        fromXmppUsername: '',
        timestamp: 12345,
      })
    );

    const message = state.rooms[ROOM_JID].messages.find((m) => m.id === 'm1');
    expect(message?.receivedBy).toBeUndefined();
  });

  it('sets the room-level displayed watermark for a user', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      setDisplayedMarker({
        roomJID: ROOM_JID,
        xmppUsername: 'bob',
        messageId: 'm2',
      })
    );

    expect(state.rooms[ROOM_JID].lastDisplayedByUser).toEqual({ bob: 'm2' });
  });

  it('overwrites a user watermark with the newer message', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      setDisplayedMarker({ roomJID: ROOM_JID, xmppUsername: 'bob', messageId: 'm1' })
    );
    state = reducer(
      state,
      setDisplayedMarker({ roomJID: ROOM_JID, xmppUsername: 'bob', messageId: 'm2' })
    );

    expect(state.rooms[ROOM_JID].lastDisplayedByUser).toEqual({ bob: 'm2' });
  });
});
