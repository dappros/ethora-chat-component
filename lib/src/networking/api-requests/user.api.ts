import http from '../apiClient';
import { createSharedRequest, SharedRequest } from '../sharedRequest';
import { store } from '../../roomStore';
import { User } from '../../types/types';

interface GetMyUserOptions {
  token?: string;
  endpoint?: string;
  signal?: AbortSignal;
}

export function getDocuments(walletAddress: string) {
  const token = store.getState().chatSettingStore.user.token || '';
  return http.get(`/v1/docs/${walletAddress}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function getExportMyData() {
  const token = store.getState().chatSettingStore.user.token || '';
  return http.get('/v1/users/exportData', {
    headers: {
      Authorization: token,
      responseType: 'arraybuffer',
    },
  });
}

export function deleteMe() {
  return http.delete('/v1/users');
}

export function updateMe(data: any) {
  return http.put('/v1/users', data);
}

export async function updateProfile(fd: FormData): Promise<{ user: User }> {
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.put('/v1/users', fd, {
      headers: {
        Authorization: token,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error('Error updating profile');
  }
}

// /users/my is hit from several concurrent bootstrap paths (initBeforeLoad
// resolution, LoginWrapper enrichment, login helpers). A short-TTL cache +
// in-flight dedup collapses that fan-out to one request per token.
const MY_USER_CACHE_TTL_MS = 10_000;
const myUserInflight = new Map<string, SharedRequest<User>>();
const myUserCache = new Map<string, { user: User; ts: number }>();

// Mirrors invalidateRoomsCache: drop the short-TTL /users/my snapshot, e.g.
// on logout or when a test needs a cold cache.
export function invalidateMyUserCache() {
  myUserCache.clear();
}

export async function getMyUser(
  options?: GetMyUserOptions
): Promise<User> {
  const token = options?.token || store.getState().chatSettingStore.user.token || '';
  const endpoint = options?.endpoint || '/v1/users/my';
  const key = `${token}|${endpoint}`;

  const cached = myUserCache.get(key);
  if (cached && Date.now() - cached.ts < MY_USER_CACHE_TTL_MS) {
    return cached.user;
  }

  const inflight = myUserInflight.get(key);
  if (inflight) return inflight.join(options?.signal);

  // Shared between concurrent callers; each caller's own AbortSignal only
  // detaches that caller (see createSharedRequest). Nothing is cached on
  // failure (the cache is written only on success) and the in-flight entry
  // is cleared in finally, so the next caller issues a fresh request.
  const shared = createSharedRequest((signal) =>
    http
      .get(endpoint, {
        headers: {
          Authorization: token,
        },
        signal,
      })
      .then((response) => {
        const user = (response?.data?.user || response.data) as User;
        myUserCache.set(key, { user, ts: Date.now() });
        return user;
      })
      .finally(() => {
        myUserInflight.delete(key);
      })
  );

  myUserInflight.set(key, shared);
  return shared.join(options?.signal);
}
