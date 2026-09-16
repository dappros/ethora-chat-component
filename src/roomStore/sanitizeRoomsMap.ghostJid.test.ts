import { describe, expect, it } from 'vitest';
import { sanitizeRoomsMap, sanitizeRoomsStateTransform } from './index';
import { IRoom } from '../types/types';

const makeRoom = (jid: string, overrides: Partial<IRoom> = {}): IRoom =>
  ({
    jid,
    name: jid,
    title: jid,
    usersCnt: 0,
    messages: [],
    isLoading: false,
    roomBg: null,
    ...overrides,
  }) as IRoom;

// Regression: createRoomFromApi used to be able to build a JID with an
// empty domain ("<name>@") whenever it ran before the conference host was
// known. That fix (createRoomFromApi.jidGuard.test.ts) stops new ghosts
// from being created, but anyone who already had one persisted keeps it
// forever unless hydration itself drops it. sanitizeRoomsMap is the seam
// used on both the read and the write path (see sanitizeRoomsSliceKey), so
// fixing it here purges already-persisted ghosts for existing users too.
describe('sanitizeRoomsMap - drops ghost JIDs with an empty conference host', () => {
  it('drops a key that ends in a bare "@"', () => {
    const result = sanitizeRoomsMap({
      'app1_room1@': makeRoom('app1_room1@'),
    });
    expect(result).toEqual({});
  });

  it('drops a key with no "@" at all', () => {
    const result = sanitizeRoomsMap({
      app1_room1: makeRoom('app1_room1'),
    });
    expect(result).toEqual({});
  });

  it('keeps a properly-keyed room alongside a ghost, dropping only the ghost', () => {
    const result = sanitizeRoomsMap({
      'app1_room1@conference.example.com': makeRoom(
        'app1_room1@conference.example.com'
      ),
      'app1_room1@': makeRoom('app1_room1@'),
    });
    expect(Object.keys(result)).toEqual(['app1_room1@conference.example.com']);
  });

  // The critical "be conservative" requirement: a legitimately-keyed room
  // that simply hasn't loaded any messages yet (a normal, common state -
  // e.g. right after login, before MAM/history has come back) must never
  // be mistaken for a ghost and dropped.
  it('keeps a legitimately-keyed room that has zero loaded messages', () => {
    const result = sanitizeRoomsMap({
      'app1_room1@conference.example.com': makeRoom(
        'app1_room1@conference.example.com',
        { messages: [] }
      ),
    });
    expect(result['app1_room1@conference.example.com']).toBeDefined();
    expect(result['app1_room1@conference.example.com'].messages).toEqual([]);
  });

  it('is applied on rehydrate, purging a ghost already sitting in localStorage', () => {
    const legacyPersistedRoomsMap = {
      'app1_room1@conference.example.com': makeRoom(
        'app1_room1@conference.example.com'
      ),
      'app1_room1@': makeRoom('app1_room1@'),
    };

    const rehydrated = sanitizeRoomsStateTransform.out(
      legacyPersistedRoomsMap,
      'rooms',
      {} as any
    ) as any;

    expect(rehydrated['app1_room1@conference.example.com']).toBeDefined();
    expect(rehydrated['app1_room1@']).toBeUndefined();
  });

  it('is applied on the way to storage too, so a ghost is never written in the first place', () => {
    const inMemoryRoomsMap = {
      'app1_room1@conference.example.com': makeRoom(
        'app1_room1@conference.example.com'
      ),
      'app1_room1@': makeRoom('app1_room1@'),
    };

    const persisted = sanitizeRoomsStateTransform.in(
      inMemoryRoomsMap,
      'rooms',
      {} as any
    ) as any;

    expect(persisted['app1_room1@']).toBeUndefined();
  });
});
