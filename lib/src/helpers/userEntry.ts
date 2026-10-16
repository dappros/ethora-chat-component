import { RoomMember } from '../types/types';

/**
 * Narrow lookup into `rooms.usersSet` for one user key.
 *
 * Returns the entry only for an own property of the map. Prototype keys
 * (`__proto__`, `constructor`, `prototype`) are refused outright: a plain
 * dictionary lookup would hand back `Object.prototype` members for them,
 * which look like a user entry to every caller that checks truthiness.
 *
 * Components use this with a `useSelector` on `state.rooms.usersSet` so they
 * subscribe to one entry (reference-stable under Immer) instead of the whole
 * map.
 */
export const lookupUserEntry = (
  usersSet: Record<string, RoomMember> | null | undefined,
  key: string | null | undefined
): RoomMember | undefined => {
  if (!usersSet || !key) return undefined;
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    return undefined;
  }
  return Object.prototype.hasOwnProperty.call(usersSet, key)
    ? usersSet[key]
    : undefined;
};
