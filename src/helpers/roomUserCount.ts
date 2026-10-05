import { IRoom } from '../types/types';

type CountSource =
  | Pick<IRoom, 'members' | 'usersCnt'>
  | { members?: unknown; usersCnt?: unknown }
  | null
  | undefined;

/**
 * User count to DISPLAY for a room. /chats/my returns `usersCnt` (the true
 * total) but at most 30 members for big public rooms, so the truncated
 * members array must never win over usersCnt.
 */
export const getRoomUserCount = (room: CountSource): number => {
  const members = Array.isArray(room?.members) ? room.members.length : 0;
  const cnt =
    typeof room?.usersCnt === 'number' && Number.isFinite(room.usersCnt)
      ? room.usersCnt
      : 0;
  return Math.max(cnt, members);
};

/** True when the room is known to have more users than members loaded. */
export const isRoomMembersTruncated = (room: CountSource): boolean => {
  const members = Array.isArray(room?.members) ? room.members.length : 0;
  const cnt =
    typeof room?.usersCnt === 'number' && Number.isFinite(room.usersCnt)
      ? room.usersCnt
      : 0;
  return cnt > members;
};

/**
 * Next usersCnt after a live join (+1) or leave (-1). Adjusts the CURRENT
 * count instead of recomputing from the (possibly truncated) members array.
 */
export const adjustUsersCnt = (
  room: CountSource,
  delta: 1 | -1,
  nextMembersLength: number
): number => {
  const current = getRoomUserCount(room);
  return Math.max(nextMembersLength, current + delta, 0);
};
