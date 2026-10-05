import type { RoomMember } from '../types/types';

/** Stable identity of a member: normalised xmppUsername local part, else _id. */
export const memberKey = (m: Partial<RoomMember> | null | undefined): string => {
  const x = String(m?.xmppUsername || '').split('@')[0].trim().toLowerCase();
  if (x) return x;
  return String(m?._id || (m as any)?.jid || '').split('@')[0].trim().toLowerCase();
};

/**
 * Drops repeated members (keeps the first occurrence, order preserved).
 * The room directory endpoint can return the same user on several pages;
 * duplicates would produce duplicate React keys and inflated counts.
 * Members without any identity are dropped.
 */
export const dedupeMembers = <T extends Partial<RoomMember>>(
  list: ReadonlyArray<T> | null | undefined
): T[] => {
  if (!list?.length) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const m of list) {
    const k = memberKey(m);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
};
