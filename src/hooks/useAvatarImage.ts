import { useCallback, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../roomStore';
import {
  appendFileToken,
  isSecureFileUrl,
  requestFileTokenRecovery,
} from '../helpers/secureFileUrl';
import {
  getLoadedAvatarUrl,
  hasAvatarFailed,
  markAvatarFailed,
  markAvatarLoaded,
} from '../helpers/avatarImageCache';

export type AvatarImageStatus = 'none' | 'loading' | 'loaded' | 'failed';

interface AvatarImageState {
  src: string;
  status: AvatarImageStatus;
}

/**
 * Resolves an avatar URL for rendering. Never waits on the network: the
 * caller shows initials immediately and fades the <img> in once `status` is
 * `loaded`.
 *
 *  - appends the viewer's `?ft=` token for secure-files URLs synchronously
 *    from the store (no token round trip before the request starts);
 *  - reuses a URL that already loaded for the same file (see
 *    avatarImageCache) so a token rotation or a second component showing the
 *    same person does not trigger another download;
 *  - skips URLs that just failed (no repeated failing requests);
 *  - on a secure-file failure kicks the throttled fileToken recovery, whose
 *    refreshed token yields a new URL and therefore a new attempt.
 */
export const useAvatarImage = (
  rawSrc: string | null | undefined
): {
  src: string;
  status: AvatarImageStatus;
  onLoad: () => void;
  onError: () => void;
} => {
  const base = rawSrc || '';
  const secure = isSecureFileUrl(base);
  const fileToken = useSelector((state: RootState) =>
    secure ? state.chatSettingStore?.user?.fileToken || '' : ''
  );
  const tokenised = secure ? appendFileToken(base, fileToken) : base;

  // Blob/data URLs (a freshly picked file) are not shared across components.
  const shareable =
    !!tokenised && !tokenised.startsWith('blob:') && !tokenised.startsWith('data:');
  const src = shareable ? getLoadedAvatarUrl(tokenised) || tokenised : tokenised;

  const initialStatus = (url: string): AvatarImageStatus => {
    if (!url) return 'none';
    if (hasAvatarFailed(url)) return 'failed';
    // Was loaded earlier this session (possibly by another component), so the
    // browser has the bytes: show it at once, no placeholder flash.
    if (shareable && getLoadedAvatarUrl(url) === url) return 'loaded';
    return 'loading';
  };

  const [state, setState] = useState<AvatarImageState>({
    src,
    status: initialStatus(src),
  });
  // Derive during render so a changed URL never shows the previous URL's
  // status for a frame (a recycled row, or a token-rotated URL).
  const current: AvatarImageState =
    state.src === src ? state : { src, status: initialStatus(src) };

  const onLoad = useCallback(() => {
    markAvatarLoaded(src);
    setState({ src, status: 'loaded' });
  }, [src]);

  const onError = useCallback(() => {
    markAvatarFailed(src);
    if (isSecureFileUrl(src)) {
      // Fire and forget: success updates the store token, which re-renders
      // with a new URL.
      requestFileTokenRecovery().catch(() => undefined);
    }
    setState({ src, status: 'failed' });
  }, [src]);

  return { src, status: current.status, onLoad, onError };
};
