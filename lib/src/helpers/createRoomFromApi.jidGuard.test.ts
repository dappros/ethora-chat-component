import { describe, expect, it } from 'vitest';
import { createRoomFromApi } from './createRoomFromApi';
import reducer, { addRoom } from '../roomStore/roomsSlice';
import { ApiRoom } from '../types/types';

const baseApiRoom: ApiRoom = {
  name: 'app1_room1',
  type: 'group',
  title: 'Room 1',
};

// Regression for the "every room appears twice" bug: createRoomFromApi's
// default parameter used to combine a truthy room.name with a falsy
// `service` into "<name>@", a JID with an empty domain. It looks valid
// enough (it has an '@') that isValidRoomJid let it through, but no such
// room exists on the server - it rendered as a permanent duplicate ghost
// with no history and no presence. createRoomFromApi must now refuse to
// build a JID at all when it has no conference host to attach.
describe('createRoomFromApi - never builds a JID without a conference host', () => {
  it('returns null when no conference host is supplied (undefined)', () => {
    expect(createRoomFromApi(baseApiRoom, undefined)).toBeNull();
  });

  it('returns null when the conference host resolves to an empty string', () => {
    expect(createRoomFromApi(baseApiRoom, '')).toBeNull();
  });

  it('never produces a JID ending in a bare "@"', () => {
    const room = createRoomFromApi(baseApiRoom, '');
    expect(room?.jid?.endsWith('@')).not.toBe(true);
  });

  it('builds the normal "<name>@<conference>" JID once a real host is supplied', () => {
    const room = createRoomFromApi(baseApiRoom, 'conference.example.com');
    expect(room?.jid).toBe('app1_room1@conference.example.com');
  });

  it('still returns null when the API room itself has no name, regardless of the host', () => {
    expect(
      createRoomFromApi({ ...baseApiRoom, name: '' }, 'conference.example.com')
    ).toBeNull();
  });

  it('a room built with no conference host never lands in the store', () => {
    const room = createRoomFromApi(baseApiRoom, undefined);
    // Every call site is expected to guard against `null`, but the store
    // itself must also refuse to insert a room with no usable jid -
    // dispatching straight through here must be a safe no-op, not a crash.
    const state = reducer(undefined, addRoom({ roomData: room as never }));
    expect(Object.keys(state.rooms)).toHaveLength(0);
  });
});
