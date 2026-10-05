import http from '../apiClient';
import { RoomMember } from '../../types/types';
import { store } from '../../roomStore';
import { normalizeXmppUsername } from '../../helpers/xmppUsername';

interface CacheEntry {
  value: RoomMember | null;
  // Epoch ms after which this entry stops counting. `Infinity` for anything
  // we consider settled: a resolved profile, or an id that is structurally
  // not lookupable.
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Single-user lookup with a route fallback chain.
//
//   1. GET /v1/apps/users/<xmppUsername>      the intended route; the backend
//      moved it to B2B-only auth (400 'Invalid token type' for a user token)
//      and plans to reopen it to user tokens with a shared-room check.
//   2. GET /v2/chats/users?xmppUsername=<id>  works with a user token, but
//      returns email and tags: only display fields are ever kept from it.
//
// A 400/401 (or a 404 that is not USER_NOT_FOUND, i.e. a missing route) means
// the route does not take our token: it is remembered as unsupported for
// ROUTE_TTL_MS and v2 is used meanwhile; v1 is probed again after the TTL so
// it recovers on its own once the backend fixes it. A 403 on v1 is a per-user
// answer (the shared-room rule): 'forbidden', the route stays supported and
// v2 is NOT consulted (it would leak what v1 refused).
// ---------------------------------------------------------------------------
export type UserLookupRoute = 'auto' | 'v1' | 'v2';
export type UserLookupOutcome =
  | { status: 'ok'; user: RoomMember }
  | { status: 'notfound' | 'forbidden' | 'error' };

const ROUTE_TTL_MS = 10 * 60_000;
// 0 = v1 not known to be unsupported, otherwise the epoch ms it is retried at
let v1UnsupportedUntil = 0;
// one v1 probe at a time while the route state is unknown, so a burst of
// lookups does not send one failing v1 request each
let v1Probe: Promise<void> | null = null;
let v1Verified = false;
let routeOverride: UserLookupRoute | null = null;

/** Module-level override of config.userLookupRoute (tests, non-React hosts). */
export const setUserLookupRoute = (route: UserLookupRoute | null) => {
  routeOverride = route;
};

/** Forgets what was learned about the routes (account change, logout, tests). */
export const resetUserLookupRoute = () => {
  v1UnsupportedUntil = 0;
  v1Verified = false;
  v1Probe = null;
};

/** Visible for tests and diagnostics. */
export const isUserV1RouteUnsupported = (): boolean =>
  v1UnsupportedUntil > Date.now();

const configuredRoute = (): UserLookupRoute => {
  const cfg = routeOverride ??
    (store.getState().chatSettingStore?.config as any)?.userLookupRoute;
  return cfg === 'v1' || cfg === 'v2' ? cfg : 'auto';
};

const pickUserPayload = (data: any): any => {
  if (!data || typeof data !== 'object') return null;
  let c = data.result ?? data.item ?? data.data ?? null;
  if (Array.isArray(c)) c = c[0] ?? null;
  if (!c && (data.xmppUsername || data.firstName || data.lastName)) c = data;
  if (c && typeof c === 'object' && (c.result || c.item) && !c.xmppUsername) {
    c = c.result ?? c.item;
  }
  return c && typeof c === 'object' ? c : null;
};

// Display fields only: v2 also returns email and tags, v1 a description.
const stripUser = (raw: any): RoomMember | null => {
  const c = pickUserPayload(raw);
  if (!c) return null;
  const out: any = {};
  if (c._id != null) out._id = String(c._id);
  if (typeof c.xmppUsername === 'string') out.xmppUsername = c.xmppUsername;
  if (typeof c.firstName === 'string') out.firstName = c.firstName;
  if (typeof c.lastName === 'string') out.lastName = c.lastName;
  if (typeof c.profileImage === 'string' && c.profileImage) {
    out.profileImage = c.profileImage;
  }
  return Object.keys(out).length ? (out as RoomMember) : null;
};

const isUserNotFoundBody = (data: any): boolean => {
  let text = '';
  try {
    text = typeof data === 'string' ? data : JSON.stringify(data ?? '');
  } catch {
    return false;
  }
  return /USER_NOT_FOUND/i.test(text) || /user[^a-z]{0,3}not[^a-z]{0,3}found/i.test(text);
};

type RouteResult = UserLookupOutcome | { status: 'route-unsupported' };

const callRoute = async (
  url: string,
  params: Record<string, string> | undefined,
  token: string,
  v1: boolean
): Promise<RouteResult> => {
  try {
    const res = await http.get(url, {
      ...(params ? { params } : {}),
      headers: { Authorization: token },
    });
    const user = stripUser(res?.data);
    return user ? { status: 'ok', user } : { status: 'error' };
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 404) {
      if (isUserNotFoundBody(error?.response?.data)) {
        return { status: 'notfound' };
      }
      // a 404 without USER_NOT_FOUND on v1 is a route that is not there
      return v1 ? { status: 'route-unsupported' } : { status: 'notfound' };
    }
    if (status === 403) return { status: 'forbidden' };
    if (v1 && (status === 400 || status === 401)) {
      return { status: 'route-unsupported' };
    }
    return { status: 'error' };
  }
};

const callV1 = (id: string, token: string) =>
  callRoute(`/v1/apps/users/${encodeURIComponent(id)}`, undefined, token, true);
const callV2 = (id: string, token: string) =>
  callRoute('/v2/chats/users', { xmppUsername: id }, token, false);

/**
 * One user by `appId_userId`, through the route chain above. Never throws.
 * `forbidden` and `notfound` are per-user answers, `error` is transient.
 */
export async function lookupUser(
  id: string,
  token: string
): Promise<UserLookupOutcome> {
  const mode = configuredRoute();
  if (mode === 'v2') return (await callV2(id, token)) as UserLookupOutcome;
  if (mode === 'v1') {
    const r = await callV1(id, token);
    return r.status === 'route-unsupported' ? { status: 'error' } : r;
  }
  for (let guard = 0; guard < 3; guard++) {
    if (v1UnsupportedUntil > Date.now()) {
      return (await callV2(id, token)) as UserLookupOutcome;
    }
    if (v1Probe && !v1Verified) {
      await v1Probe;
      continue;
    }
    const probing = !v1Verified;
    let release: () => void = () => {};
    if (probing) v1Probe = new Promise<void>((r) => (release = r));
    const r = await callV1(id, token);
    if (r.status === 'route-unsupported') {
      v1UnsupportedUntil = Date.now() + ROUTE_TTL_MS;
      v1Verified = false;
      if (probing) {
        v1Probe = null;
        release();
      }
      return (await callV2(id, token)) as UserLookupOutcome;
    }
    if (r.status !== 'error') v1Verified = true;
    if (probing) {
      v1Probe = null;
      release();
    }
    return r;
  }
  return { status: 'error' };
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<RoomMember | null>>();

// How long a miss is remembered. A brand-new user's profile can 400/404 or
// come back empty for a while after they register (backend indexing lag),
// and remembering that forever used to pin the raw xmpp id as their display
// name for the whole session: every later message from them hit the cached
// miss instead of retrying, and only a full page reload (fresh module state)
// ever cleared it. Short enough that the name heals on the next message,
// long enough that a busy room does not re-request a genuinely unknown
// sender once per incoming stanza.
const MISS_TTL_MS = 5000;

const readCache = (key: string): CacheEntry | undefined => {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry;
};

const rememberHit = (key: string, value: RoomMember) => {
  cache.set(key, { value, expiresAt: Infinity });
};

const rememberMiss = (key: string, permanent = false) => {
  cache.set(key, {
    value: null,
    expiresAt: permanent ? Infinity : Date.now() + MISS_TTL_MS,
  });
};

const isLookupable = (canonical: string): boolean => {
  if (!canonical) return false;
  const appId = store.getState().chatSettingStore?.appId || '';
  if (!appId) return true;
  if (canonical === appId) return false;
  if (canonical === `${appId}_${appId}`) return false;
  return true;
};

export async function getUserByXmppUsername(
  xmppUsername: string | undefined,
  token: string
): Promise<RoomMember | null> {
  const trimmed = String(xmppUsername || '').trim();
  if (!trimmed || trimmed === 'undefined') {
    return null;
  }
  const normalizedXmppUsername = normalizeXmppUsername(trimmed);
  if (!normalizedXmppUsername || !isLookupable(normalizedXmppUsername)) {
    // Not a transient failure: this id will never resolve, so it is settled.
    rememberMiss(normalizedXmppUsername || trimmed, true);
    return null;
  }

  const cached = readCache(normalizedXmppUsername);
  if (cached) {
    return cached.value;
  }
  const pending = inflight.get(normalizedXmppUsername);
  if (pending) return pending;

  const request = (async (): Promise<RoomMember | null> => {
    try {
      const outcome = await lookupUser(normalizedXmppUsername, token);
      if (outcome.status === 'ok') {
        rememberHit(normalizedXmppUsername, outcome.user);
        return outcome.user;
      }
      // Any miss (not found, forbidden, empty 200, failure) is held briefly
      // and retried later: a just-registered profile can answer any of them.
      rememberMiss(normalizedXmppUsername);
      return null;
    } catch (error) {
      rememberMiss(normalizedXmppUsername);
      console.error(`Failed to fetch user: ${normalizedXmppUsername}`, error);
      return null;
    } finally {
      inflight.delete(normalizedXmppUsername);
    }
  })();

  inflight.set(normalizedXmppUsername, request);
  return request;
}
