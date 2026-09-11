import { describe, expect, it } from 'vitest';
import { createRoomFromApi } from './createRoomFromApi';
import { ApiRoom } from '../types/types';

const baseApiRoom: ApiRoom = {
  name: 'app1_room1',
  type: 'group',
  title: 'Room 1',
};

describe('createRoomFromApi - carries `muted` through the ApiRoom -> IRoom mapping', () => {
  it('copies `muted: true` from the backend response', () => {
    const room = createRoomFromApi({ ...baseApiRoom, muted: true }, 'conference.example.com');
    expect(room.muted).toBe(true);
  });

  it('copies `muted: false` from the backend response', () => {
    const room = createRoomFromApi({ ...baseApiRoom, muted: false }, 'conference.example.com');
    expect(room.muted).toBe(false);
  });

  // Prod doesn't send `muted` yet - the field must stay absent (not become
  // `false`), so useRoomMute's `isSupported` check can tell "not muted" apart
  // from "this backend doesn't support mute at all".
  it('leaves `muted` unset when the backend response omits it', () => {
    const room = createRoomFromApi({ ...baseApiRoom }, 'conference.example.com');
    expect('muted' in room).toBe(false);
  });
});
