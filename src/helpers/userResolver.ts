import http from '../networking/apiClient';
import {
  lookupUser,
  resetUserLookupRoute,
} from '../networking/api-requests/roomMembers.api';
import { dedupeMembers } from './dedupeMembers';
import { store } from '../roomStore';
import { insertUsers } from '../roomStore/roomsSlice';
import { updateUser } from '../roomStore/chatSettingsSlice';
import { isSafeKey, hasSafeIdSegments } from '../roomStore/safeKey';
import { normalizeXmppUsername } from './xmppUsername';
import { toLocalPart } from './xmppIdShape';
import type { RoomMember } from '../types/types';

// Lazy user resolution.
//
// GET /v1/chats/my returns at most 30 members of a big room (plus
// `usersCnt`), so senders of older messages are unknown to usersSet. The
// source of truth for a name is the backend user record, fetched here:
//   - one user: GET /v1/apps/users/<appId_userId>, falling back to
//     GET /v2/chats/users?xmppUsername=<appId_userId> when the backend does
//     not take our token on v1 (see lookupUser in roomMembers.api.ts)
//   - GET /v2/chats/users?chatName=<roomLocal>&limit=500 a room directory
// Results go into rooms.usersSet through insertUsers (which also re-names
// the messages already in the store). Only display fields are kept: the
// endpoint also returns email and tags, which must never reach the
// persisted usersSet.

export type RoomDirectoryState = 'idle' | 'loading' | 'done' | 'error';

const DEBOUNCE_MS = 150;
const CONCURRENCY = 4;
const SINGLE_FETCH_LIMIT = 10;
const MAX_PENDING = 200;
const NOT_FOUND_TTL_MS = 10 * 60_000;
const BACKOFF_STEPS_MS = [5_000, 30_000];
const DIRECTORY_PAGE_LIMIT = 500;
const DIRECTORY_MAX_PAGES = 200;
const DIRECTORY_MAX_STALE_PAGES = 5;
const INSERT_BUFFER_MS = 100;

type NegativeKind = 'notfound' | 'forbidden' | 'error';
type Negative = { until: number; kind: NegativeKind; attempts: number };

let generation = 0;
const pending = new Set<string>();
const inflight = new Set<string>();
const negative = new Map<string, Negative>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let activeWorkers = 0;
const queue: string[] = [];
let insertBuffer: RoomMember[] = [];
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
const refreshAgain = new Set<string>();
// ids whose in-progress fetch was asked for by refreshUser
const refreshForced = new Set<string>();
let insertTimer: ReturnType<typeof setTimeout> | null = null;

const dirState = new Map<string, RoomDirectoryState>();
const dirInflight = new Map<string, Promise<void>>();
// A failed directory is not retried for a while: without this a dead
// endpoint turned every debounce pass into another directory request.
const DIRECTORY_RETRY_MS = 30_000;
const dirFailedAt = new Map<string, number>();
const dirCoolingDown = (jid: string): boolean =>
  Date.now() - (dirFailedAt.get(jid) ?? -Infinity) < DIRECTORY_RETRY_MS;
// The directory members of each room in server order, grown page by page.
const dirMembers = new Map<string, RoomMember[]>();
const listeners = new Set<() => void>();

const notify = () => {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // a broken subscriber must not stop the others
    }
  });
};

/** Re-render hook: called when a directory state or a negative cache entry changes. */
export const subscribeUserResolver = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

let sessionIdentity = '';

/**
 * The signed-in account is the session identity: when another account signs
 * in, every cache and in-flight result of the previous one is dropped (a
 * token refresh for the same account must not). No token (logout, or a
 * transient rehydrate gap) just yields '' and does no work.
 */
const getToken = (): string => {
  const u = store.getState().chatSettingStore?.user as any;
  const token = u?.token || '';
  const identity = String(u?.xmppUsername || u?._id || '');
  if (token && identity && sessionIdentity && identity !== sessionIdentity) {
    resetUserResolver();
  }
  if (token && identity) sessionIdentity = identity;
  return token;
};

/** `appId_userId@host/res`, `appId_userId`, or a doubled prefix -> `appId_userId`. */
const normalizeId = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  const local = toLocalPart(raw.split('/')[0]).trim();
  if (!local || local === 'undefined') return '';
  return normalizeXmppUsername(local);
};

const isLookupable = (id: string): boolean => {
  if (!id || /\s/.test(id) || !isSafeKey(id)) return false;
  // Only appId_userId shaped ids can exist on the backend.
  if (!id.includes('_')) return false;
  if (!hasSafeIdSegments(id)) return false;
  const appId = store.getState().chatSettingStore?.appId || '';
  if (appId && (id === appId || id === `${appId}_${appId}`)) return false;
  return true;
};

const sanitizeUser = (raw: any, fallbackId?: string): RoomMember | null => {
  if (!raw || typeof raw !== 'object') return null;
  const xmppUsername = normalizeId(raw.xmppUsername) || fallbackId || '';
  if (!isSafeKey(xmppUsername)) return null;
  const user: RoomMember = {
    _id: String(raw._id ?? ''),
    xmppUsername,
    firstName: typeof raw.firstName === 'string' ? raw.firstName : '',
    lastName: typeof raw.lastName === 'string' ? raw.lastName : '',
  };
  if (typeof raw.profileImage === 'string' && raw.profileImage) {
    user.profileImage = raw.profileImage;
  }
  return user;
};

const flushInserts = () => {
  if (insertTimer) {
    clearTimeout(insertTimer);
    insertTimer = null;
  }
  if (!insertBuffer.length) return;
  const batch = insertBuffer;
  insertBuffer = [];
  store.dispatch(insertUsers({ newUsers: batch }));
};

const bufferInsert = (users: RoomMember[]) => {
  if (!users.length) return;
  insertBuffer.push(...users);
  if (!insertTimer) insertTimer = setTimeout(flushInserts, INSERT_BUFFER_MS);
};

const markNegative = (id: string, kind: NegativeKind) => {
  const prev = negative.get(id);
  const attempts = (prev?.kind === 'error' ? prev.attempts : 0) + 1;
  const ttl =
    kind !== 'error'
      ? NOT_FOUND_TTL_MS
      : BACKOFF_STEPS_MS[Math.min(attempts - 1, BACKOFF_STEPS_MS.length - 1)];
  negative.set(id, { until: Date.now() + ttl, kind, attempts });
};

const isNegative = (id: string): boolean => {
  const n = negative.get(id);
  if (!n) return false;
  if (n.until <= Date.now()) {
    // keep an expired error entry so attempts keep escalating the backoff
    if (n.kind !== 'error') negative.delete(id);
    return false;
  }
  return true;
};

/**
 * True for an id the backend answered 404 for: the user really is gone.
 * (An id merely not resolved yet is NOT "not found".)
 */
export const isUserNotFound = (rawId: string): boolean => {
  const n = negative.get(normalizeId(rawId));
  return Boolean(n && n.kind === 'notfound' && n.until > Date.now());
};

/**
 * Where a sender's lookup stands, for the display chain:
 * - resolved: in usersSet
 * - pending: queued, in flight, or not requested yet (a bubble just mounted)
 * - notfound / forbidden: the backend answered, nothing to show from it
 * - failed: the last attempt errored (backoff), or the lookup is exhausted
 * - unavailable: this id can never be looked up (plain handle) or there is
 *   no session token, so nothing is coming
 */
export type UserLookupStatus =
  | 'resolved'
  | 'pending'
  | 'notfound'
  | 'forbidden'
  | 'failed'
  | 'unavailable';

export const getUserLookupStatus = (rawId: string): UserLookupStatus => {
  const id = normalizeId(rawId);
  if (!id) return 'unavailable';
  if (store.getState().rooms?.usersSet?.[id]) return 'resolved';
  const n = negative.get(id);
  // an answer recorded a moment ago wins over the in-flight bookkeeping that
  // is cleared right after it
  if (n && isNegative(id)) return n.kind === 'error' ? 'failed' : n.kind;
  if (pending.has(id) || inflight.has(id) || queue.includes(id)) {
    return 'pending';
  }
  if (n && n.kind === 'error') return 'failed';
  if (!isLookupable(id) || !getToken()) return 'unavailable';
  return 'pending';
};

// A refreshed profile that is the signed-in user's own also updates the
// session user (chatSettingStore.user), which feeds the own-profile UI.
// Only the display fields, and only when something actually changed.
const applyToSessionUser = (id: string, fresh: RoomMember) => {
  const me = store.getState().chatSettingStore?.user as any;
  if (!me || normalizeId(me.xmppUsername) !== id) return;
  const updates: Record<string, string> = {};
  if (fresh.firstName !== undefined && fresh.firstName !== me.firstName) {
    updates.firstName = fresh.firstName;
  }
  if (fresh.lastName !== undefined && fresh.lastName !== me.lastName) {
    updates.lastName = fresh.lastName;
  }
  if (fresh.profileImage && fresh.profileImage !== me.profileImage) {
    updates.profileImage = fresh.profileImage;
  }
  if (Object.keys(updates).length) store.dispatch(updateUser({ updates }));
};

const fetchOne = async (id: string, gen: number): Promise<void> => {
  const token = getToken();
  if (!token) return;
  const outcome = await lookupUser(id, token);
  if (gen !== generation) return;
  if (outcome.status === 'ok') {
    const user = sanitizeUser(outcome.user, id);
    if (user) {
      negative.delete(id);
      bufferInsert([user]);
      if (refreshForced.delete(id)) applyToSessionUser(id, user);
      return;
    }
    markNegative(id, 'notfound');
  } else {
    markNegative(id, outcome.status);
  }
  notify();
};

const pump = (gen: number) => {
  while (activeWorkers < CONCURRENCY && queue.length) {
    const id = queue.shift() as string;
    activeWorkers++;
    inflight.add(id);
    void fetchOne(id, gen).finally(() => {
      if (gen !== generation) return;
      inflight.delete(id);
      activeWorkers--;
      // a refresh asked for while this fetch was running: its answer may
      // predate the change, so fetch once more
      if (refreshAgain.delete(id) && !queue.includes(id)) queue.push(id);
      if (queue.length) pump(gen);
      else if (activeWorkers === 0) flushInserts();
    });
  }
};

const knownUsers = (): Record<string, RoomMember> =>
  store.getState().rooms?.usersSet || {};

/** The room, if any, whose unknown senders among `ids` justify one directory fetch. */
const pickDirectoryRoom = (ids: string[]): string | null => {
  const idSet = new Set(ids);
  const rooms = store.getState().rooms?.rooms || {};
  let best: string | null = null;
  let bestCount = SINGLE_FETCH_LIMIT;
  for (const [jid, room] of Object.entries(rooms)) {
    const cnt = Number((room as any)?.usersCnt || 0);
    const have = Array.isArray((room as any)?.members)
      ? (room as any).members.length
      : 0;
    if (!(have < cnt) || dirState.get(jid) === 'done' || dirCoolingDown(jid)) {
      continue;
    }
    const seen = new Set<string>();
    for (const m of (room as any).messages || []) {
      const uid = normalizeId(m?.user?.id);
      if (uid && idSet.has(uid)) seen.add(uid);
    }
    if (seen.size > bestCount) {
      best = jid;
      bestCount = seen.size;
    }
  }
  return best;
};

const flush = () => {
  debounceTimer = null;
  const gen = generation;
  const users = knownUsers();
  const ids = [...pending].filter(
    (id) => !users[id] && !inflight.has(id) && !isNegative(id)
  );
  pending.clear();
  if (!ids.length) return;

  if (ids.length > SINGLE_FETCH_LIMIT) {
    const roomJid = pickDirectoryRoom(ids);
    if (roomJid) {
      void ensureRoomDirectory(roomJid).then(() => {
        if (gen !== generation) return;
        // whoever the directory did not contain (left the room) still gets
        // the per-user lookup
        requestUsers(ids);
      });
      return;
    }
  }
  for (const id of ids) if (!queue.includes(id)) queue.push(id);
  pump(gen);
};

/**
 * Ask for the profiles of these senders. Cheap to call from anywhere (a
 * bubble mounting, a history batch parse): known, in-flight and recently
 * failed ids are dropped, the rest are debounced into one pass.
 */
export function requestUsers(ids: string[]): void {
  if (!Array.isArray(ids) || !ids.length) return;
  if (!getToken()) return;
  const users = knownUsers();
  let added = false;
  for (const raw of ids) {
    const id = normalizeId(raw);
    if (!isLookupable(id)) continue;
    if (users[id] || inflight.has(id) || pending.has(id) || isNegative(id)) {
      continue;
    }
    pending.add(id);
    added = true;
    if (pending.size > MAX_PENDING) {
      // drop the oldest
      const oldest = pending.values().next().value as string;
      pending.delete(oldest);
    }
  }
  if (!added) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flush, DEBOUNCE_MS);
}

const REFRESH_DEBOUNCE_MS = 500;

/**
 * Re-fetch one user's profile even though it is already in usersSet, because
 * the server said it changed (ethora-event user-profile-updated). Bypasses
 * the cache and forgets a negative-cache entry, but shares everything else
 * with requestUsers: the same route chain (lookupUser), the same worker
 * queue and concurrency cap, one request at a time per user. Calls for the
 * same user within REFRESH_DEBOUNCE_MS coalesce into one fetch. The answer
 * goes through insertUsers (display fields only), so existing bubbles are
 * re-named. Never throws.
 */
export function refreshUser(rawId: string): void {
  const id = normalizeId(rawId);
  if (!isLookupable(id) || !getToken()) return;
  const prior = refreshTimers.get(id);
  if (prior) clearTimeout(prior);
  const gen = generation;
  refreshTimers.set(
    id,
    setTimeout(() => {
      refreshTimers.delete(id);
      if (gen !== generation) return;
      negative.delete(id);
      refreshForced.add(id);
      if (inflight.has(id)) {
        refreshAgain.add(id);
        return;
      }
      if (!queue.includes(id)) queue.push(id);
      pump(gen);
    }, REFRESH_DEBOUNCE_MS)
  );
}

const EMPTY_DIRECTORY: RoomMember[] = [];

/**
 * Members loaded so far by ensureRoomDirectory for this room (a new array
 * identity after every page, a stable empty array before any).
 */
export const getRoomDirectoryMembers = (roomJID: string): RoomMember[] =>
  dirMembers.get(roomJID) || EMPTY_DIRECTORY;

/** requestUsers for the senders of a batch of messages (history page, jump window). */
export function requestSendersOf(
  messages: ReadonlyArray<{ user?: { id?: string } } | null | undefined> | undefined
): void {
  if (!messages?.length) return;
  const ids = new Set<string>();
  for (const m of messages) {
    const id = m?.user?.id;
    if (id) ids.add(id);
  }
  if (ids.size) requestUsers([...ids]);
}

export const getRoomDirectoryState = (roomJID: string): RoomDirectoryState =>
  dirState.get(roomJID) || 'idle';

const setDirState = (roomJID: string, state: RoomDirectoryState) => {
  if (dirState.get(roomJID) === state) return;
  dirState.set(roomJID, state);
  notify();
};

/**
 * Loads every member of one room into usersSet, once. Pages are not
 * guaranteed to be full, so it stops on an empty page or offset >= total,
 * never on `items.length < limit`.
 */
export function ensureRoomDirectory(roomJID: string): Promise<void> {
  if (!roomJID || typeof roomJID !== 'string') return Promise.resolve();
  if (dirState.get(roomJID) === 'done') return Promise.resolve();
  const running = dirInflight.get(roomJID);
  if (running) return running;
  if (dirCoolingDown(roomJID)) return Promise.resolve();
  const token = getToken();
  const chatName = toLocalPart(roomJID);
  if (!token || !chatName) return Promise.resolve();

  const gen = generation;
  setDirState(roomJID, 'loading');
  const job = (async () => {
    let offset = 0;
    let total = Infinity;
    let stale = 0;
    try {
      for (let page = 0; page < DIRECTORY_MAX_PAGES; page++) {
        const res = await http.get('/v2/chats/users', {
          params: { chatName, limit: DIRECTORY_PAGE_LIMIT, offset },
          headers: { Authorization: token },
        });
        if (gen !== generation) return;
        const data = res?.data || {};
        const items: any[] = Array.isArray(data.items)
          ? data.items
          : Array.isArray(data.results)
            ? data.results
            : [];
        if (!items.length) break;
        const batch = items
          .map((item) => sanitizeUser(item))
          .filter((u): u is RoomMember => Boolean(u));
        // The backend can repeat the same user across pages (total counts the
        // repeats), so merge by identity: first occurrence wins.
        const before = dirMembers.get(roomJID) || EMPTY_DIRECTORY;
        const merged = dedupeMembers([...before, ...batch]);
        const added = merged.length - before.length;
        if (added > 0) {
          store.dispatch(insertUsers({ newUsers: batch }));
          dirMembers.set(roomJID, merged);
          notify();
        }
        offset += items.length;
        // Pages made only of repeats are normal at the tail (the real
        // 435/11/3/1 shape), but a run of them means the server ignores
        // offset: stop instead of walking to the page cap.
        stale = added > 0 ? 0 : stale + 1;
        if (stale >= DIRECTORY_MAX_STALE_PAGES) break;
        const t = Number(data.total ?? data.pagination?.total);
        if (Number.isFinite(t)) total = t;
        if (offset >= total) break;
      }
      if (gen === generation) setDirState(roomJID, 'done');
    } catch {
      if (gen === generation) {
        dirFailedAt.set(roomJID, Date.now());
        setDirState(roomJID, 'error');
      }
    }
  })().finally(() => {
    if (dirInflight.get(roomJID) === job) dirInflight.delete(roomJID);
  });
  dirInflight.set(roomJID, job);
  return job;
}

/** For tests and logout: drops every cache, timer and in-flight result. */
export function resetUserResolver(): void {
  generation++;
  sessionIdentity = '';
  pending.clear();
  inflight.clear();
  negative.clear();
  resetUserLookupRoute();
  queue.length = 0;
  activeWorkers = 0;
  insertBuffer = [];
  refreshTimers.forEach((t) => clearTimeout(t));
  refreshTimers.clear();
  refreshAgain.clear();
  refreshForced.clear();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  if (insertTimer) clearTimeout(insertTimer);
  insertTimer = null;
  dirState.clear();
  dirInflight.clear();
  dirFailedAt.clear();
  dirMembers.clear();
  notify();
}
