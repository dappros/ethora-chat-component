import http from '../apiClient';
import { RoomMember } from '../../types/types';
import { store } from '../../roomStore';

const cache = new Map<string, RoomMember | null>();
const inflight = new Map<string, Promise<RoomMember | null>>();

const normalizeXmppUsername = (username: string): string => {
  const appId = store.getState().chatSettingStore?.appId || '';
  if (!appId) return username;
  const doublePrefix = `${appId}_${appId}_`;
  if (username.startsWith(doublePrefix)) {
    return username.slice(appId.length + 1);
  }
  if (username === `${appId}_${appId}`) return '';
  return username;
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
  if (!normalizedXmppUsername) {
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
        `/apps/users/${normalizedXmppUsername}`,
        {
          headers: { Authorization: token },
        }
      );
      const result = res.data.result ?? null;
      cache.set(normalizedXmppUsername, result);
      return result;
    } catch (error) {
      cache.set(normalizedXmppUsername, null);
      console.error(`Failed to fetch user: ${normalizedXmppUsername}`, error);
      return null;
    } finally {
      inflight.delete(normalizedXmppUsername);
    }
  })();

  inflight.set(normalizedXmppUsername, request);
  return request;
}
