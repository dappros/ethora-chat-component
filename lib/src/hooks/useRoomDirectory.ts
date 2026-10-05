import { useEffect, useSyncExternalStore } from 'react';
import {
  ensureRoomDirectory,
  getRoomDirectoryMembers,
  getRoomDirectoryState,
  subscribeUserResolver,
  type RoomDirectoryState,
} from '../helpers/userResolver';
import type { RoomMember } from '../types/types';

const NO_MEMBERS: RoomMember[] = [];

/**
 * Directory of a big room (usersCnt > the members the API returned).
 * `enabled` starts the (once per room, deduplicated) load; the result grows
 * page by page. Rooms that are not truncated never trigger a request.
 */
export const useRoomDirectory = (
  roomJid: string | undefined,
  enabled: boolean
): { members: RoomMember[]; state: RoomDirectoryState } => {
  const jid = roomJid || '';
  const members = useSyncExternalStore(
    subscribeUserResolver,
    () => (jid ? getRoomDirectoryMembers(jid) : NO_MEMBERS),
    () => NO_MEMBERS
  );
  const state = useSyncExternalStore(
    subscribeUserResolver,
    () => (jid ? getRoomDirectoryState(jid) : 'idle'),
    () => 'idle' as RoomDirectoryState
  );

  useEffect(() => {
    if (enabled && jid) void ensureRoomDirectory(jid);
  }, [enabled, jid]);

  return { members, state };
};
