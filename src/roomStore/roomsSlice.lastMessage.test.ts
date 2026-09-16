import { describe, expect, it } from 'vitest';
import reducer from './roomsSlice';
import { IRoom, LastMessage } from '../types/types';

const JID = 'room1@conference.example.com';

const makeRoom = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: JID,
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages: [],
    isLoading: false,
    roomBg: null,
    ...overrides,
  }) as IRoom;

const seed: LastMessage = {
  id: 'msg-1',
  roomJid: JID,
  body: 'seeded from the API',
  date: '2026-09-16T10:00:00.000Z',
  user: { id: 'alice-id', name: 'Alice' },
};

// addRoomFromApi isn't exported (it's only ever reached through the
// addRoomViaApi thunk), so dispatch its raw action type directly - the
// same way any createSlice reducer can be exercised without the thunk
// wrapper around it.
const dispatchAddRoomFromApi = (state: unknown, room: IRoom) =>
  reducer(state as never, {
    type: 'roomMessages/addRoomFromApi',
    payload: { room },
  });

describe('roomsSlice addRoomFromApi - lastMessage is a seed, live messages always win', () => {
  it('seeds lastMessage for a room with no loaded messages yet', () => {
    const state = dispatchAddRoomFromApi(undefined, makeRoom({ lastMessage: seed }));
    expect(state.rooms[JID].lastMessage).toEqual(seed);
  });

  it('a later refresh with no lastMessage (e.g. prod) does not erase a previously-seeded one', () => {
    let state = dispatchAddRoomFromApi(undefined, makeRoom({ lastMessage: seed }));
    state = dispatchAddRoomFromApi(state, makeRoom({ lastMessage: undefined }));
    expect(state.rooms[JID].lastMessage).toEqual(seed);
  });

  it('a fresher API lastMessage replaces an older seed', () => {
    const newerSeed: LastMessage = {
      ...seed,
      id: 'msg-2',
      body: 'a newer API message',
    };
    let state = dispatchAddRoomFromApi(undefined, makeRoom({ lastMessage: seed }));
    state = dispatchAddRoomFromApi(state, makeRoom({ lastMessage: newerSeed }));
    expect(state.rooms[JID].lastMessage).toEqual(newerSeed);
  });

  // The core "layered on top" guarantee: once real messages have loaded
  // for a room, addRoomFromApi keeps `messages` as the live ones (existing
  // behaviour), and a stale lastMessage sitting alongside them is inert -
  // ChatRoomItem only ever reads `lastMessage` while `messages` is empty.
  it('does not touch the live messages array when re-seeding lastMessage', () => {
    const liveMessage = {
      id: 'live-1',
      roomJid: JID,
      body: 'a real live message',
      date: '2026-09-16T11:00:00.000Z',
      user: { id: 'bob-id', name: 'Bob' },
    } as never;

    let state = dispatchAddRoomFromApi(
      undefined,
      makeRoom({ messages: [liveMessage] })
    );
    state = dispatchAddRoomFromApi(
      state,
      makeRoom({ messages: [], lastMessage: seed })
    );

    expect(state.rooms[JID].messages).toEqual([liveMessage]);
    expect(state.rooms[JID].lastMessage).toEqual(seed);
  });
});
