import { describe, expect, it } from 'vitest';
import reducer, { addRoom, updateRoom, updateRooms } from './roomsSlice';
import { IRoom } from '../types/types';

const makeRoom = (overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid: 'room1@conference.example.com',
    name: 'room1',
    title: 'Room 1',
    usersCnt: 0,
    messages: [],
    isLoading: false,
    roomBg: null,
    ...overrides,
  }) as IRoom;

// Regression: onUserUpdate in stanzaHandlers.ts dispatched one updateRoom
// action per affected room for a single headline stanza. updateRooms lets
// it dispatch once for all of them; this test checks the batched reducer
// produces the same per-room result as calling updateRoom repeatedly.
describe('roomsSlice updateRooms', () => {
  it('applies updates to multiple rooms in a single action', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    state = reducer(
      state,
      addRoom({
        roomData: makeRoom({
          jid: 'room2@conference.example.com',
          name: 'room2',
        }),
      })
    );

    state = reducer(
      state,
      updateRooms([
        {
          jid: 'room1@conference.example.com',
          updates: { members: [{ xmppUsername: 'alice' } as never] },
        },
        {
          jid: 'room2@conference.example.com',
          updates: { members: [{ xmppUsername: 'bob' } as never] },
        },
      ])
    );

    expect(state.rooms['room1@conference.example.com'].members).toEqual([
      { xmppUsername: 'alice' },
    ]);
    expect(state.rooms['room2@conference.example.com'].members).toEqual([
      { xmppUsername: 'bob' },
    ]);
    // usersCnt derivation must match the single-room updateRoom behavior.
    expect(state.rooms['room1@conference.example.com'].usersCnt).toBe(1);
    expect(state.rooms['room2@conference.example.com'].usersCnt).toBe(1);
  });

  it('matches dispatching updateRoom once per room', () => {
    let batched = reducer(undefined, addRoom({ roomData: makeRoom() }));
    batched = reducer(
      batched,
      addRoom({
        roomData: makeRoom({
          jid: 'room2@conference.example.com',
          name: 'room2',
        }),
      })
    );
    let sequential = batched;

    const updates = [
      { jid: 'room1@conference.example.com', updates: { title: 'New Title' } },
      { jid: 'room2@conference.example.com', updates: { usersCnt: 5 } },
    ];

    batched = reducer(batched, updateRooms(updates));
    for (const u of updates) {
      sequential = reducer(sequential, updateRoom(u));
    }

    expect(batched.rooms).toEqual(sequential.rooms);
  });

  it('silently skips rooms that do not exist in state', () => {
    const state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    const next = reducer(
      state,
      updateRooms([
        { jid: 'unknown@conference.example.com', updates: { title: 'x' } },
      ])
    );
    expect(next.rooms['unknown@conference.example.com']).toBeUndefined();
  });
});
