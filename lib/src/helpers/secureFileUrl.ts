import { store } from '../roomStore';
import { refresh } from '../networking/apiClient';
import { refreshTokens } from '../roomStore/chatSettingsSlice';

// Files uploaded via /v2/files/secure are served from the secure-files.*
// domain and every download is gated by chat membership: the server needs
// `?ft=<fileToken>` (or a fileToken cookie) to identify the requester.
// The fileToken is personal — it must be appended at render time from the
// viewer's own session, never baked into the URL sent over XMPP.
const SECURE_FILES_HOST_PREFIX = 'secure-files.';

export const isSecureFileUrl = (url?: string | null): boolean => {
  if (!url) return false;
  try {
    return new URL(url).hostname.startsWith(SECURE_FILES_HOST_PREFIX);
  } catch {
    return false;
  }
};

// Pure variant for components: pass the fileToken from a useSelector
// subscription so a token refresh re-renders the media with a fresh URL.
export const appendFileToken = (
  url: string | null | undefined,
  fileToken: string | null | undefined
): string => {
  if (!url) return '';
  if (!fileToken || !isSecureFileUrl(url)) return url;

  try {
    const parsed = new URL(url);
    parsed.searchParams.set('ft', fileToken);
    return parsed.toString();
  } catch {
    return url;
  }
};

// Imperative variant for click-time actions (download, preview open):
// reads the current token straight from the store.
export const withFileToken = (url?: string | null): string =>
  appendFileToken(
    url,
    store.getState().chatSettingStore?.user?.fileToken || ''
  );

// The fileToken normally rides along the 401-driven refresh interceptor,
// but images can start failing before any API call hits a 401 (fileToken
// lives ~1h). When a secure image errors, this kicks the same refresh flow
// the interceptor uses; the resulting refreshTokens dispatch re-renders
// subscribed media with the fresh token. Throttled so a screenful of
// broken images triggers one refresh, not dozens.
const RECOVERY_COOLDOWN_MS = 30_000;
let recoveryInFlight: Promise<boolean> | null = null;
let lastRecoveryAt = 0;

export const requestFileTokenRecovery = (): Promise<boolean> => {
  if (recoveryInFlight) return recoveryInFlight;

  const now = Date.now();
  if (now - lastRecoveryAt < RECOVERY_COOLDOWN_MS) {
    return Promise.resolve(false);
  }
  lastRecoveryAt = now;

  const state = store.getState();
  const refreshConfig = state.chatSettingStore?.config?.refreshTokens;
  const user = state.chatSettingStore?.user;

  if (!refreshConfig?.enabled) return Promise.resolve(false);

  const run = async (): Promise<boolean> => {
    if (refreshConfig.refreshFunction) {
      const refreshed = await refreshConfig.refreshFunction();
      if (!refreshed?.accessToken) return false;
      store.dispatch(
        refreshTokens({
          token: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || user?.refreshToken || '',
          fileToken: refreshed.fileToken,
        })
      );
      return Boolean(refreshed.fileToken);
    }

    if (!user?.refreshToken) return false;
    // refresh() dispatches refreshTokens (fileToken included) itself and
    // dispatches logout() if the refresh token is dead — same contract as
    // the 401 interceptor.
    await refresh();
    return true;
  };

  recoveryInFlight = run()
    .catch(() => false)
    .finally(() => {
      recoveryInFlight = null;
    });

  return recoveryInFlight;
};
