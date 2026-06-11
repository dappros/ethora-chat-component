import { describe, expect, it } from 'vitest';
import reducer, { addRoom } from './roomsSlice';
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

describe('roomsSlice unread baseline', () => {
  it('assigns a non-zero unread baseline to rooms without a read marker', () => {
    const state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    const room = state.rooms['room1@conference.example.com'];

    // Without a baseline the unread middleware can never count messages for
    // a room the user has not opened yet (cutoff stays 0 forever).
    expect(room.unreadBaselineTimestamp).toBeGreaterThan(0);
  });

  it('anchors the baseline at the newest already-loaded message', () => {
    const messageTs = Date.now() - 60_000;
    const state = reducer(
      undefined,
      addRoom({
        roomData: makeRoom({
          messages: [
            {
              id: String(messageTs),
              body: 'hello',
              date: new Date(messageTs).toISOString(),
              user: { id: 'someone', name: 'Someone' },
            } as never,
          ],
        }),
      })
    );
    const room = state.rooms['room1@conference.example.com'];

    expect(room.unreadBaselineTimestamp).toBe(messageTs);
  });

  it('prefers an existing read marker over the message fallback', () => {
    const lastViewed = Date.now() - 5_000;
    const state = reducer(
      undefined,
      addRoom({ roomData: makeRoom({ lastViewedTimestamp: lastViewed }) })
    );
    const room = state.rooms['room1@conference.example.com'];

    expect(room.unreadBaselineTimestamp).toBe(lastViewed);
  });

  it('keeps the first baseline across repeated addRoom merges', () => {
    let state = reducer(undefined, addRoom({ roomData: makeRoom() }));
    const initialBaseline =
      state.rooms['room1@conference.example.com'].unreadBaselineTimestamp;

    state = reducer(state, addRoom({ roomData: makeRoom() }));

    expect(
      state.rooms['room1@conference.example.com'].unreadBaselineTimestamp
    ).toBe(initialBaseline);
  });
});
