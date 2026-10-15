import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isSecureFileUrl,
  requestFileTokenRecovery,
  withoutFileToken,
} from '../helpers/secureFileUrl';

export type MediaProbeStatus = 'idle' | 'loading' | 'recovering' | 'loaded' | 'error';

export interface MediaProbe {
  status: MediaProbeStatus;
  /**
   * Natural size. Known once `status` is 'loaded', and usually sooner: it is
   * read from the first decoded header while the bytes are still arriving.
   */
  width: number;
  height: number;
  /**
   * The URL whose bytes are on screen. While a picture is shown, a rotated
   * `?ft=` token does not swap it for a fresh request: the URL that loaded
   * stays, so a token refresh never blanks or re-downloads what is visible.
   */
  url: string;
}

const EARLY_SIZE_POLL_MS = 40;

/**
 * No byte of the file (not even its header) arrived in this long: stop
 * waiting and show the unavailable state with a manual retry. Once the size
 * is known the file is on its way and is never cut off by this timer.
 */
export const MEDIA_STALL_MS = 8000;

/**
 * After a token refresh the new URL is expected within a render or two; if
 * it never arrives (the refresh handed back the same token) do not hang.
 */
const RECOVERY_SETTLE_MS = 1500;

const FAILED_TTL_MS = 60_000;
const CACHE_LIMIT = 400;

const IDLE: MediaProbe = { status: 'idle', width: 0, height: 0, url: '' };

interface LoadedEntry {
  url: string;
  width: number;
  height: number;
}

// Keyed by the token-free URL: the same file reached with another viewer
// token is the same picture, so a remounted bubble (virtualised list,
// switching rooms) paints at once instead of replaying the skeleton.
const loadedCache = new Map<string, LoadedEntry>();
// Keyed by the exact URL (token included): a failure under one token says
// nothing about the next one. Stops a remounted tile from replaying a whole
// failing chain, once per render, for a file that already failed.
const failedCache = new Map<string, number>();

const isCacheable = (url: string) => !url.startsWith('blob:') && !url.startsWith('data:');

const remember = <V,>(map: Map<string, V>, key: string, value: V) => {
  map.delete(key);
  map.set(key, value);
  if (map.size > CACHE_LIMIT) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
};

const recentlyFailed = (url: string): boolean => {
  const at = failedCache.get(url);
  if (at === undefined) return false;
  if (Date.now() - at > FAILED_TTL_MS) {
    failedCache.delete(url);
    return false;
  }
  return true;
};

export const resetMediaProbeCaches = () => {
  loadedCache.clear();
  failedCache.clear();
};

const initialProbe = (url: string | undefined): MediaProbe => {
  if (!url) return IDLE;
  if (isCacheable(url)) {
    const hit = loadedCache.get(withoutFileToken(url));
    if (hit) return { status: 'loaded', width: hit.width, height: hit.height, url: hit.url };
    if (recentlyFailed(url)) return { status: 'error', width: 0, height: 0, url };
  }
  return { status: 'loading', width: 0, height: 0, url };
};

/**
 * Preloads one image off-DOM so the visible <img> only mounts once its bytes
 * are cached.
 *
 * A failure never says anything about the file being deleted: a 404 from the
 * storage host, an expired token, a CORS or DNS hiccup and a dead CDN edge all
 * fail an <img> the same way, and the server's answer cannot be read across
 * origins anyway. So the only outcome is the 'error' state, which the surface
 * offers to `retry`. Deleting a message is driven by the server (a delete
 * stanza) or by the sender's own Files panel action, never inferred here.
 *
 * A secure URL that fails gets at most one shared token refresh per token
 * (see `requestFileTokenRecovery`); the refreshed URL re-runs this effect.
 */
export const useMediaProbe = (
  url: string | undefined
): MediaProbe & { retry: () => void; fail: () => void } => {
  const [probe, setProbe] = useState<MediaProbe>(() => initialProbe(url));
  const [nonce, setNonce] = useState(0);
  // The token-free identity of the picture currently on screen, if any.
  const shownRef = useRef<string | null>(null);
  const forceRef = useRef(false);

  const retry = useCallback(() => {
    if (url) failedCache.delete(url);
    shownRef.current = null;
    forceRef.current = true;
    setNonce((value) => value + 1);
  }, [url]);

  /**
   * The picture the probe called loaded failed on the visible <img> (an
   * expired token, an evicted or no-store response): forget it everywhere
   * and show the unavailable state, so a cached "loaded" never resurrects it.
   */
  const fail = useCallback(() => {
    if (!url) return;
    loadedCache.delete(withoutFileToken(url));
    shownRef.current = null;
    if (isCacheable(url)) remember(failedCache, url, Date.now());
    setProbe((current) => ({ status: 'error', width: 0, height: 0, url: current.url || url }));
  }, [url]);

  useEffect(() => {
    if (!url) {
      shownRef.current = null;
      setProbe(IDLE);
      return;
    }
    const base = withoutFileToken(url);
    const manual = forceRef.current;
    forceRef.current = false;

    // Same picture, new viewer token: keep what is on screen.
    if (shownRef.current === base) return;

    if (!manual && isCacheable(url)) {
      const hit = loadedCache.get(base);
      if (hit) {
        shownRef.current = base;
        setProbe({ status: 'loaded', width: hit.width, height: hit.height, url: hit.url });
        return;
      }
      if (recentlyFailed(url)) {
        setProbe({ status: 'error', width: 0, height: 0, url });
        return;
      }
    }

    let cancelled = false;
    setProbe({ status: 'loading', width: 0, height: 0, url });

    const fail = () => {
      if (isCacheable(url)) remember(failedCache, url, Date.now());
      setProbe({ status: 'error', width: 0, height: 0, url });
    };

    const image = new Image();
    // The size is known as soon as the header is parsed, long before onload
    // for a big file: publish it so the box can be sized early.
    let early: ReturnType<typeof setInterval> | undefined;
    let stall: ReturnType<typeof setTimeout> | undefined;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const stopEarly = () => {
      if (early !== undefined) clearInterval(early);
      early = undefined;
    };
    const stopStall = () => {
      if (stall !== undefined) clearTimeout(stall);
      stall = undefined;
    };
    image.onload = () => {
      stopEarly();
      stopStall();
      if (cancelled) return;
      shownRef.current = base;
      const entry = { url, width: image.naturalWidth, height: image.naturalHeight };
      if (isCacheable(url)) {
        failedCache.delete(url);
        remember(loadedCache, base, entry);
      }
      setProbe({ status: 'loaded', ...entry });
    };
    image.onerror = () => {
      stopEarly();
      stopStall();
      if (cancelled) return;
      if (isSecureFileUrl(url)) {
        setProbe({ status: 'recovering', width: 0, height: 0, url });
        // On success the store update hands us a fresh URL, which re-runs
        // this effect; otherwise the file is shown as unavailable.
        requestFileTokenRecovery({ force: manual }).then((gotToken) => {
          if (cancelled) return;
          if (!gotToken) {
            fail();
            return;
          }
          settle = setTimeout(() => {
            if (!cancelled) fail();
          }, RECOVERY_SETTLE_MS);
        });
        return;
      }
      fail();
    };
    image.src = url;
    if (image.complete === false) {
      early = setInterval(() => {
        if (cancelled || !(image.naturalWidth > 0 && image.naturalHeight > 0)) return;
        stopEarly();
        stopStall();
        setProbe((current) =>
          current.status === 'loading'
            ? { status: 'loading', width: image.naturalWidth, height: image.naturalHeight, url }
            : current
        );
      }, EARLY_SIZE_POLL_MS);
      stall = setTimeout(() => {
        if (cancelled) return;
        stopEarly();
        image.onload = null;
        image.onerror = null;
        // Abort the transfer so a hung request does not hold a connection.
        image.src = '';
        fail();
      }, MEDIA_STALL_MS);
    }

    return () => {
      cancelled = true;
      stopEarly();
      stopStall();
      if (settle !== undefined) clearTimeout(settle);
      image.onload = null;
      image.onerror = null;
    };
  }, [url, nonce]);

  return { ...probe, retry, fail };
};
