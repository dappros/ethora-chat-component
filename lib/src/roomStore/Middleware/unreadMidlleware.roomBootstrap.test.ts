import { describe, expect, it, vi } from 'vitest';

// unreadMidlleware.tsx imports isSameXmppUsername, which reads the live
// `store` (for appId-prefix normalization) and so transitively imports
// roomStore/index.ts — which itself imports unreadMiddleware FROM this same
// module. That circular pair resolves fine when the app boots normally or
// when another test reaches it via a different entry point, but importing
// unreadMidlleware.tsx as this test's own entry point hits the cycle in
// the other order and configureStore() sees `unreadMiddleware` mid-circular-
// resolution (still undefined). resolveTouchedRooms itself never calls
// isSameXmppUsername, so stub the module to sidestep the cycle entirely
// rather than touching the production import graph for a test-only need.
vi.mock('../../helpers/xmppUsername', () => ({
  toLocalPart: (v?: string) => String(v || '').split('@')[0],
  normalizeXmppUsername: (v?: string | null) => String(v || ''),
  isSameXmppUsername: (a?: string | null, b?: string | null) => a === b,
}));

const { resolveTouchedRooms } = await import('./unreadMidlleware');

const room = (jid: string) => ({ jid, name: jid });

describe('resolveTouchedRooms — room bootstrap (O(N) not O(N^2))', () => {
  it('addRoomFromApi touches only the newly added room, not every room added so far', () => {
    // Simulate the exact bootstrap loop in useGetNewArchRoom.tsx: one
    // addRoomFromApi dispatch per room, added one at a time.
    const jids = ['room1@conf', 'room2@conf', 'room3@conf', 'room4@conf'];
    let totalTouched = 0;
    const rooms: Record<string, unknown> = {};

    jids.forEach((jid) => {
      const prevState = { rooms: { rooms: { ...rooms } } };
      rooms[jid] = room(jid);
      const nextState = { rooms: { rooms: { ...rooms } } };

      const action = {
        type: 'roomMessages/addRoomFromApi',
        payload: { room: room(jid) },
      };

      const touched = resolveTouchedRooms(action, prevState, nextState);
      // The regression this guards against: touching ALL rooms added so far
      // (1, then 2, then 3, then 4 — O(N^2) total) instead of just the one
      // room this action actually added.
      expect(touched.size).toBe(1);
      expect(touched.has(jid)).toBe(true);
      totalTouched += touched.size;
    });

    // O(N) total, not O(N^2)/2 (which would be 1+2+3+4=10 for 4 rooms).
    expect(totalTouched).toBe(jids.length);
  });

  it('addRoom touches only the one room from roomData', () => {
    const action = {
      type: 'roomMessages/addRoom',
      payload: { roomData: room('solo@conf') },
    };
    const touched = resolveTouchedRooms(
      action,
      { rooms: { rooms: {} } },
      { rooms: { rooms: { 'solo@conf': room('solo@conf') } } }
    );
    expect([...touched]).toEqual(['solo@conf']);
  });

  it('addRoomViaApi thunk lifecycle actions touch nothing (no-op, no state mutation)', () => {
    const rooms = { a: room('a'), b: room('b'), c: room('c') };
    const state = { rooms: { rooms: rooms } };

    for (const suffix of ['pending', 'fulfilled', 'rejected']) {
      const touched = resolveTouchedRooms(
        { type: `roomMessages/addRoomViaApi/${suffix}` },
        state,
        state
      );
      expect(touched.size).toBe(0);
    }
  });

  it('deleteRoom and setLogoutState still sweep every room (unchanged behavior)', () => {
    const rooms = { a: room('a'), b: room('b'), c: room('c') };
    const touched = resolveTouchedRooms(
      { type: 'roomMessages/deleteRoom', payload: { jid: 'b' } },
      { rooms: { rooms: rooms } },
      { rooms: { rooms: { a: room('a'), c: room('c') } } }
    );
    expect(touched.size).toBe(3);
  });
});
