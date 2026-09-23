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
      const res = await http.get<{ result: RoomMember }>(
        `/v1/apps/users/${normalizedXmppUsername}`,
        {
          headers: { Authorization: token },
        }
      );
      const result = res.data.result ?? null;
      // An empty 200 is a miss like any other: the same just-registered
      // profile that 400s on one backend answers 200 with nothing on
      // another, and neither is a reason to give up on the name for good.
      if (result) {
        rememberHit(normalizedXmppUsername, result);
      } else {
        rememberMiss(normalizedXmppUsername);
      }
      return result;
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
