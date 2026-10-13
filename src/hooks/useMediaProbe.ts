import { useEffect, useRef, useState } from 'react';
import { isSecureFileUrl, requestFileTokenRecovery } from '../helpers/secureFileUrl';

export type MediaProbeStatus = 'idle' | 'loading' | 'recovering' | 'loaded' | 'error';

export interface MediaProbe {
  status: MediaProbeStatus;
  /**
   * Natural size. Known once `status` is 'loaded', and usually sooner: it is
   * read from the first decoded header while the bytes are still arriving.
   */
  width: number;
  height: number;
}

const EARLY_SIZE_POLL_MS = 40;

const IDLE: MediaProbe = { status: 'idle', width: 0, height: 0 };

/**
 * A broken <img> on its own is not proof that the file was deleted: an
 * offline blip, a DNS/CORS hiccup or a dead CDN edge all fail the same way,
 * and tombstoning a message is not reversible. Ask the server first and only
 * report the file as gone when it says so.
 */
export const confirmFileIsGone = async (url: string): Promise<boolean> => {
  if (typeof fetch !== 'function') return false;
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.status === 404 || response.status === 410;
  } catch {
    return false;
  }
};

/**
 * Preloads one image off-DOM so the visible <img> only mounts once its bytes
 * are cached. A secure URL that fails gets one token-refresh attempt; a
 * failure that survives it, or any failure of a public URL, is reported to
 * `onGone` only when the server confirms the file is missing.
 */
export const useMediaProbe = (url: string | undefined, onGone?: () => void): MediaProbe => {
  const [probe, setProbe] = useState<MediaProbe>(IDLE);
  const onGoneRef = useRef(onGone);
  useEffect(() => {
    onGoneRef.current = onGone;
  }, [onGone]);

  useEffect(() => {
    if (!url) {
      setProbe(IDLE);
      return;
    }
    let cancelled = false;
    setProbe({ status: 'loading', width: 0, height: 0 });

    const reportIfGone = () => {
      if (!onGoneRef.current) return;
      void confirmFileIsGone(url).then((gone) => {
        if (!cancelled && gone) onGoneRef.current?.();
      });
    };

    const image = new Image();
    // The size is known as soon as the header is parsed, long before onload
    // for a big file: publish it so the box can be sized early.
    let early: ReturnType<typeof setInterval> | undefined;
    const stopEarly = () => {
      if (early !== undefined) clearInterval(early);
      early = undefined;
    };
    image.onload = () => {
      stopEarly();
      if (cancelled) return;
      setProbe({
        status: 'loaded',
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => {
      stopEarly();
      if (cancelled) return;
      if (isSecureFileUrl(url)) {
        setProbe({ status: 'recovering', width: 0, height: 0 });
        // On success the store update hands us a fresh URL, which re-runs
        // this effect; on failure the file is shown as unavailable.
        requestFileTokenRecovery().then((gotToken) => {
          if (cancelled || gotToken) return;
          setProbe({ status: 'error', width: 0, height: 0 });
          reportIfGone();
        });
        return;
      }
      setProbe({ status: 'error', width: 0, height: 0 });
      reportIfGone();
    };
    image.src = url;
    if (image.complete === false) {
      early = setInterval(() => {
        if (cancelled || !(image.naturalWidth > 0 && image.naturalHeight > 0)) return;
        stopEarly();
        setProbe((current) =>
          current.status === 'loading'
            ? { status: 'loading', width: image.naturalWidth, height: image.naturalHeight }
            : current
        );
      }, EARLY_SIZE_POLL_MS);
    }

    return () => {
      cancelled = true;
      stopEarly();
      image.onload = null;
      image.onerror = null;
    };
  }, [url]);

  return probe;
};
