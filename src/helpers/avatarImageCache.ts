import { withoutFileToken } from './secureFileUrl';

/**
 * Session-wide registry of avatar URLs, shared by every component that shows
 * a person or room photo (room list, message bubbles, member lists, headers).
 *
 * Why it exists: one person's avatar is rendered many times (every bubble of
 * the same sender, the list row, the header), each in its own component. Left
 * alone every instance starts from "unknown", shows nothing until its own
 * <img> finishes, and repeats a request that already failed. The registry
 * remembers two things:
 *
 *  - which URL last loaded fine for a given file, keyed WITHOUT the viewer's
 *    short-lived `?ft=` token. A token rotation changes the URL string, but
 *    the picture is the same, so a component that mounts after the rotation
 *    keeps using the URL that is already in the browser cache instead of
 *    re-downloading the same bytes under a new query string;
 *  - which exact URLs recently failed, so a screenful of bubbles from one
 *    sender with a dead (hotlink-blocked or expired) photo does not issue the
 *    same failing request once per bubble. Keyed WITH the token on purpose: a
 *    fresh token is a new URL and gets a fresh attempt.
 */

const MAX_ENTRIES = 500;
export const FAILED_TTL_MS = 60_000;

// identity (token-free URL) -> exact URL that loaded. Insertion ordered, so
// the oldest entry is evicted first.
const loaded = new Map<string, string>();
// exact URL -> time it failed
const failed = new Map<string, number>();

const trim = <V>(map: Map<string, V>) => {
  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) return;
    map.delete(oldest);
  }
};

export const avatarIdentity = (url: string): string => withoutFileToken(url);

/** The URL that already loaded for this file (any token), if any. */
export const getLoadedAvatarUrl = (url: string): string | undefined => {
  if (!url) return undefined;
  const known = loaded.get(avatarIdentity(url));
  if (known === undefined) return undefined;
  // Refresh recency.
  loaded.delete(avatarIdentity(url));
  loaded.set(avatarIdentity(url), known);
  return known;
};

export const markAvatarLoaded = (url: string): void => {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return;
  failed.delete(url);
  const id = avatarIdentity(url);
  loaded.delete(id);
  loaded.set(id, url);
  trim(loaded);
};

export const markAvatarFailed = (url: string): void => {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) return;
  failed.set(url, Date.now());
  trim(failed);
  const id = avatarIdentity(url);
  // The remembered "good" URL just failed (e.g. its token expired and the
  // cache entry is gone): stop steering other components to it.
  if (loaded.get(id) === url) loaded.delete(id);
};

export const hasAvatarFailed = (url: string): boolean => {
  const at = failed.get(url);
  if (at === undefined) return false;
  if (Date.now() - at > FAILED_TTL_MS) {
    failed.delete(url);
    return false;
  }
  return true;
};

/** Test helper. */
export const resetAvatarCache = (): void => {
  loaded.clear();
  failed.clear();
};
