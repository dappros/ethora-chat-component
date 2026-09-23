import http from '../apiClient';
import { RoomMember } from '../../types/types';
import { store } from '../../roomStore';
import { normalizeXmppUsername } from '../../helpers/xmppUsername';

const cache = new Map<string, RoomMember | null>();
const inflight = new Map<string, Promise<RoomMember | null>>();

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
    cache.set(normalizedXmppUsername || trimmed, null);
    return null;
  }

  if (cache.has(normalizedXmppUsername)) {
    return cache.get(normalizedXmppUsername) ?? null;
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
      cache.set(normalizedXmppUsername, result);
      return result;
    } catch (error) {
      // Deliberately NOT cached: a brand-new user's profile can 404/400 for a
      // little while after registration (backend indexing lag), and caching
      // that failure as a permanent `null` here used to poison the sender's
      // display name for the rest of the session - every later message from
      // the same user kept hitting this cached miss instead of retrying, and
      // only a full reload (fresh module state, empty cache) ever cleared it.
      // Leaving the cache untouched means the next message from this sender
      // simply tries the lookup again instead of being stuck forever.
      console.error(`Failed to fetch user: ${normalizedXmppUsername}`, error);
      return null;
    } finally {
      inflight.delete(normalizedXmppUsername);
    }
  })();

  inflight.set(normalizedXmppUsername, request);
  return request;
}
