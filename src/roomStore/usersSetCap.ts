import type { RoomMember } from '../types/types';
import { isSafeKey } from './safeKey';

/**
 * usersSet is persisted, and lazily resolved senders keep adding to it, so
 * it needs a ceiling. Object key order is insertion order, so "least
 * recently inserted" is simply the first keys.
 */
export const USERS_SET_CAP = 5000;

/** Drops the oldest-inserted entries until at most `cap` remain. */
export const capUsersSet = (
  usersSet: Record<string, RoomMember>,
  cap: number = USERS_SET_CAP
): void => {
  const keys = Object.keys(usersSet);
  const excess = keys.length - cap;
  for (let i = 0; i < excess; i++) delete usersSet[keys[i]];
};

/**
 * Merges the members of a fresh /chats/my payload into usersSet: fresh
 * entries win, entries fetched lazily earlier stay. A refreshed key moves to
 * the newest position so the cap evicts genuinely stale ones first.
 */
export const mergeUsersSet = (
  usersSet: Record<string, RoomMember>,
  fresh: Record<string, RoomMember>,
  cap: number = USERS_SET_CAP
): void => {
  for (const [key, member] of Object.entries(fresh)) {
    if (!isSafeKey(key)) continue;
    if (key in usersSet) delete usersSet[key];
    usersSet[key] = member;
  }
  capUsersSet(usersSet, cap);
};
