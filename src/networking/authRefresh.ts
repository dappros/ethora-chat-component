import http from './apiClient';
import { store } from '../roomStore';
import { refreshTokens } from '../roomStore/chatSettingsSlice';
import { getStoredUser } from '../helpers/authStorage';
import { User } from '../types/types';
import { localStorageConstants } from '../helpers/constants/LOCAL_STORAGE';

/**
 * THE single refresh-token rotation point for the SDK.
 *
 * The backend now runs refresh-token ROTATION with REUSE DETECTION:
 * every successful `/v1/users/login/refresh` burns the presented
 * refresh token and issues a new one. Presenting an already-rotated
 * token is indistinguishable, server-side, from a stolen token - so it
 * is treated as theft and (once the backend leaves monitor mode and
 * enables enforcing mode) kills the whole token family.
 *
 * That puts three hard obligations on the client:
 *
 *   1. Persist the NEW refreshToken from every response, immediately,
 *      before any other logic can throw and drop it on the floor.
 *   2. Never rotate concurrently - including ACROSS TABS. Two parallel
 *      refreshes both start from the same token; the loser presents a
 *      burned one and looks like an attacker. Hence Web Locks below,
 *      plus a same-tab in-flight promise.
 *   3. Route EVERY refresh path through here. One "side" refresh
 *      elsewhere (service worker, poller, host app) breaks the scheme
 *      for everyone.
 *
 * The subtle part is (2): serialising the requests is NOT enough. A tab
 * that waited on the lock still holds the token it read before waiting,
 * which the winner has since burned. The token must be RE-READ from
 * cross-tab storage inside the lock - see `performRefresh`.
 *
 * Callers must also stop treating 401 as "log out". Two of the four
 * refresh error codes are race signals, not auth failures - see
 * `RefreshErrorCode` below and `RefreshFatalError`.
 */

export type RefreshErrorCode =
  | 'REFRESH_IN_PROGRESS'
  | 'REFRESH_TOKEN_ALREADY_ROTATED'
  | 'REFRESH_TOKEN_REUSE_DETECTED'
  | 'REFRESH_TOKEN_NOT_FOUND';

export interface RefreshResult {
  token: string;
  refreshToken: string;
  fileToken?: string;
}

/**
 * Thrown when the session is genuinely dead and the caller must do a
 * hard logout (clear storage, drop XMPP, send the user to login).
 *
 * Anything else this module rejects with - network errors, 5xx, an
 * unrecognised 401 - is NOT fatal and must NOT trigger a logout.
 */
export class RefreshFatalError extends Error {
  code: RefreshErrorCode;

  constructor(code: RefreshErrorCode, message?: string) {
    super(message || `Refresh failed: ${code}`);
    this.name = 'RefreshFatalError';
    this.code = code;
    Object.setPrototypeOf(this, RefreshFatalError.prototype);
  }
}

export const isRefreshFatalError = (
  error: unknown
): error is RefreshFatalError =>
  error instanceof RefreshFatalError ||
  (error as RefreshFatalError)?.name === 'RefreshFatalError';

const REFRESH_ENDPOINT = '/v1/users/login/refresh';
const LOCK_NAME = 'ethora-auth-refresh';

/** `REFRESH_IN_PROGRESS` retry budget, per backend guidance (~300ms x 2-3). */
const IN_PROGRESS_MAX_ATTEMPTS = 3;
const IN_PROGRESS_BASE_DELAY_MS = 300;
/**
 * Jitter matters: after a network blip every tab retries on the same
 * schedule and would hammer the rotation mutex in lockstep.
 */
const IN_PROGRESS_JITTER_MS = 150;

const KNOWN_CODES: RefreshErrorCode[] = [
  'REFRESH_IN_PROGRESS',
  'REFRESH_TOKEN_ALREADY_ROTATED',
  'REFRESH_TOKEN_REUSE_DETECTED',
  'REFRESH_TOKEN_NOT_FOUND',
];

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const inProgressDelay = (attempt: number) =>
  IN_PROGRESS_BASE_DELAY_MS * attempt +
  Math.floor(Math.random() * IN_PROGRESS_JITTER_MS);

/**
 * All four codes come back as HTTP 401, so the status alone tells us
 * nothing - the code in the body is the only signal.
 *
 * TODO(backend-confirm): the exact location of `code` in the payload is
 * not documented yet. Until it is, probe every shape the API uses
 * elsewhere and take the first hit. Once confirmed, collapse this to
 * the single real path.
 */
export const parseRefreshErrorCode = (
  error: unknown
): RefreshErrorCode | null => {
  const response = (error as any)?.response;
  if (!response) {
    return null;
  }

  const data = response.data;
  const candidates = [
    data?.code,
    data?.error?.code,
    data?.errors?.[0]?.code,
    data?.error,
    data?.message,
    response.headers?.['x-error-code'],
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const match = KNOWN_CODES.find((code) => candidate.includes(code));
    if (match) {
      return match;
    }
  }

  return null;
};

const getStoreUser = (): Partial<User> =>
  (store.getState().chatSettingStore?.user as Partial<User>) || {};

/**
 * The refresh token as of RIGHT NOW, read from CROSS-TAB storage.
 *
 * localStorage wins over the redux copy on purpose: another tab may
 * have rotated since this tab loaded, and an in-memory copy captured at
 * module load (or at the start of a request) is exactly the stale value
 * the backend now flags as reuse. The redux copy is only a fallback for
 * when storage holds no session at all (storage disabled, SSR, or a
 * host that keeps the session purely in memory).
 */
const readCurrentTokens = (): {
  token: string;
  refreshToken: string;
  fileToken?: string;
} => {
  const stored = getStoredUser();
  if (stored?.refreshToken) {
    return {
      token: stored.token || '',
      refreshToken: stored.refreshToken,
      fileToken: (stored as User & { fileToken?: string }).fileToken,
    };
  }

  const user = getStoreUser();
  return {
    token: user.token || '',
    refreshToken: user.refreshToken || '',
    fileToken: (user as { fileToken?: string }).fileToken,
  };
};

const readCurrentRefreshToken = (): string => readCurrentTokens().refreshToken;

/**
 * Is there anything left to rotate?
 *
 * Callers used to answer this by reading the redux copy, which is wrong
 * in exactly the case that matters: `scrubSensitiveChatStateTransform`
 * (roomStore/index.ts) blanks token/refreshToken before redux-persist
 * writes them, so a freshly rehydrated second tab holds an EMPTY
 * refresh token while the real one sits in `ETHORA_USER_SESSION`. Every
 * such gate therefore has to go through storage first, same as the
 * rotation itself.
 */
export const hasRotatableSession = (): boolean =>
  Boolean(
    store.getState().chatSettingStore?.config?.refreshTokens
      ?.refreshFunction || readCurrentRefreshToken()
  );

/**
 * Persist BEFORE resolving. The dispatch updates redux and writes
 * localStorage synchronously via `persistUserSession`, which is what
 * makes the new token visible to the other tabs waiting on the lock.
 * Every early return between here and the caller is a chance to lose
 * the rotation - so there are none.
 */
const persistTokens = (result: RefreshResult): void => {
  store.dispatch(
    refreshTokens({
      token: result.token,
      refreshToken: result.refreshToken,
      fileToken: result.fileToken,
    })
  );
};

/**
 * Another tab rotated while we waited. Its tokens are already in
 * localStorage; pull them into this tab's in-memory store and use them
 * instead of rotating again.
 */
const adoptStoredTokens = (): RefreshResult | null => {
  const stored = getStoredUser();
  if (!stored?.refreshToken || !stored?.token) {
    return null;
  }

  const result: RefreshResult = {
    token: stored.token,
    refreshToken: stored.refreshToken,
    fileToken: (stored as User & { fileToken?: string }).fileToken,
  };

  if (getStoreUser().refreshToken !== result.refreshToken) {
    persistTokens(result);
  }

  return result;
};

/** Host-supplied rotation, mirrors `IConfig['refreshTokens']['refreshFunction']`. */
type ConsumerRefreshFn = () => Promise<{
  accessToken: string;
  refreshToken?: string;
  fileToken?: string;
} | null>;

const runConsumerRefresh = async (
  refreshFunction: ConsumerRefreshFn
): Promise<RefreshResult> => {
  const refreshed = await refreshFunction();

  if (!refreshed?.accessToken) {
    throw new Error('Custom refresh function did not return an access token');
  }

  if (!refreshed.refreshToken) {
    // Not fatal - some hosts still run non-rotating backends - but on a
    // rotating one this silently keeps a burned token around, which is
    // exactly the failure the new scheme punishes.
    console.warn(
      '[authRefresh] custom refreshFunction returned no refreshToken; ' +
        'keeping the existing one. On a rotating backend this will be ' +
        'seen as token reuse.'
    );
  }

  const result: RefreshResult = {
    token: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || readCurrentRefreshToken(),
    fileToken: refreshed.fileToken,
  };

  persistTokens(result);
  return result;
};

const requestRotation = async (
  refreshToken: string
): Promise<RefreshResult> => {
  const response = await http.post(
    REFRESH_ENDPOINT,
    {},
    { headers: { Authorization: refreshToken } }
  );

  const result: RefreshResult = {
    token: response?.data?.token || '',
    refreshToken: response?.data?.refreshToken || '',
    fileToken: response?.data?.fileToken,
  };

  if (!result.token || !result.refreshToken) {
    throw new Error('Refresh response did not contain both tokens');
  }

  persistTokens(result);
  return result;
};

/**
 * Runs INSIDE the lock. `tokenBeforeLock` is what this tab believed the
 * refresh token to be before it started waiting.
 */
const performRefresh = async (
  tokenBeforeLock: string,
  overrideToken?: string
): Promise<RefreshResult> => {
  const consumerRefresh =
    store.getState().chatSettingStore?.config?.refreshTokens?.refreshFunction;

  if (consumerRefresh) {
    // A configured host function wins unconditionally - including over
    // an explicit bootstrap token. Hosts that embed this SDK often own
    // the Ethora refresh token themselves (their own storage, their own
    // rotation) and only hand us a copy; rotating it here would burn
    // THEIR token behind their back and leave them holding a dead one.
    //
    // It still has to be serialised - it hits the same backend mutex -
    // hence running it inside the lock.
    return runConsumerRefresh(consumerRefresh);
  }

  // THE re-read. Serialising requests alone would still let this tab
  // rotate with the token it captured before waiting, which the winner
  // has already burned. Skipped for an explicit token: it may belong to
  // a different session than whatever is currently in storage.
  const currentAtEntry = readCurrentRefreshToken();
  if (
    !overrideToken &&
    tokenBeforeLock &&
    currentAtEntry &&
    currentAtEntry !== tokenBeforeLock
  ) {
    const adopted = adoptStoredTokens();
    if (adopted) {
      return adopted;
    }
  }

  for (let attempt = 1; attempt <= IN_PROGRESS_MAX_ATTEMPTS; attempt++) {
    const refreshToken = overrideToken || readCurrentRefreshToken();

    if (!refreshToken) {
      // Deliberately NOT fatal: a missing token mid-bootstrap must not
      // nuke a session that is still being hydrated.
      throw new Error('Refresh token is missing');
    }

    try {
      return await requestRotation(refreshToken);
    } catch (error) {
      const code = parseRefreshErrorCode(error);

      if (code === 'REFRESH_IN_PROGRESS') {
        if (attempt < IN_PROGRESS_MAX_ATTEMPTS) {
          await sleep(inProgressDelay(attempt));
          continue;
        }
        // Budget spent. Whoever holds the mutex (another tab, a worker,
        // the host app) has very likely finished and written a newer
        // token - take it if so.
        const adopted = overrideToken ? null : adoptStoredTokens();
        if (adopted && adopted.refreshToken !== refreshToken) {
          return adopted;
        }
        throw error;
      }

      if (code === 'REFRESH_TOKEN_ALREADY_ROTATED') {
        // Our copy is stale. If something already wrote a newer token,
        // this is a benign race - use it. Otherwise the session really
        // is unrecoverable.
        const adopted = overrideToken ? null : adoptStoredTokens();
        if (adopted && adopted.refreshToken !== refreshToken) {
          return adopted;
        }
        throw new RefreshFatalError(code);
      }

      if (
        code === 'REFRESH_TOKEN_REUSE_DETECTED' ||
        code === 'REFRESH_TOKEN_NOT_FOUND'
      ) {
        throw new RefreshFatalError(code);
      }

      // Network error, 5xx, plain 401 without a code - pass through
      // untouched. The caller must not log out on these.
      throw error;
    }
  }

  // Unreachable: the loop either returns or throws.
  throw new Error('Refresh attempts exhausted');
};

type LockManagerLike = {
  request: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
};

const getLockManager = (): LockManagerLike | null => {
  if (typeof navigator === 'undefined') {
    return null;
  }
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  return typeof locks?.request === 'function' ? locks : null;
};

/**
 * Web Locks are unavailable in non-secure contexts, in some embedded
 * webviews, and during SSR. Degrading to the same-tab in-flight promise
 * keeps a single tab correct; cross-tab races stay possible there, and
 * the ALREADY_ROTATED recovery path above is what absorbs them.
 */
const withLock = <T,>(callback: () => Promise<T>): Promise<T> => {
  const locks = getLockManager();
  if (!locks) {
    return callback();
  }
  return locks.request(LOCK_NAME, callback);
};

export interface RefreshOptions {
  /**
   * Rotate THIS token instead of the one in the store/storage.
   *
   * Only for bootstrap, where the session being restored isn't in the
   * store yet (a host-supplied `userLogin.user`, a persisted record).
   * Everywhere else, omitting it is the correct and safer choice: the
   * module then always presents the newest token it knows about.
   */
  refreshToken?: string;
}

let inflight: Promise<RefreshResult> | null = null;

/**
 * Rotate the tokens. Concurrent callers in this tab share ONE request;
 * concurrent tabs are serialised by the Web Lock. This is the lock the
 * new backend scheme requires.
 *
 * Rejects with `RefreshFatalError` when the session is dead (caller
 * should hard-logout) and with a plain error otherwise (caller should
 * surface the failure and leave the session alone).
 */
export function refreshAuthTokens(
  options?: RefreshOptions
): Promise<RefreshResult> {
  if (inflight) {
    // Whatever that rotation produces is at least as fresh as anything
    // this caller could have asked for.
    return inflight;
  }

  // Read BEFORE acquiring the lock, so `performRefresh` can tell
  // "nothing changed while I waited" from "someone else rotated".
  const tokenBeforeLock = readCurrentRefreshToken();

  inflight = withLock(() =>
    performRefresh(tokenBeforeLock, options?.refreshToken)
  ).finally(() => {
    inflight = null;
  });

  return inflight;
}

/**
 * Fire-and-forget variant for call sites that only want "make sure the
 * tokens are fresh" and have no meaningful error handling - chat
 * bootstrap, XMPP reconnect. Never rejects.
 */
export async function refreshAuthTokensQuietly(): Promise<RefreshResult | null> {
  try {
    return await refreshAuthTokens();
  } catch (error) {
    console.warn('[authRefresh] background refresh failed', error);
    return null;
  }
}

/**
 * Cross-tab token sync.
 *
 * The lock keeps two tabs from rotating at once, but it does nothing
 * about the tab that DIDN'T rotate: its redux copy stays on the old
 * access token (and, after a redux-persist rehydrate, on a scrubbed
 * empty refresh token) until it happens to run a refresh of its own.
 * Every request it makes in the meantime burns a 401 and a retry.
 *
 * `storage` fires in the OTHER tabs only, which is exactly the audience
 * that needs to catch up. Adoption is guarded on the refresh token
 * actually differing, so the write that `adoptStoredTokens` triggers
 * does not bounce back and forth between tabs.
 *
 * A logout clears the key: `newValue` is then null, `adoptStoredTokens`
 * finds nothing and no-ops. Propagating logout across tabs is a
 * separate concern and deliberately not done here.
 */
let stopTokenSync: (() => void) | null = null;

export function startCrossTabTokenSync(): () => void {
  if (stopTokenSync) return stopTokenSync;
  if (typeof window === 'undefined' || !window.addEventListener) {
    return () => undefined;
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== localStorageConstants.ETHORA_USER_SESSION) {
      return;
    }
    if (!event.newValue) return;
    // Never adopt mid-rotation: this tab is about to write its own
    // (newer) pair and adopting now would just dispatch a value we are
    // one HTTP round trip away from replacing.
    if (inflight) return;

    try {
      adoptStoredTokens();
    } catch (error) {
      console.warn('[authRefresh] cross-tab token sync failed', error);
    }
  };

  window.addEventListener('storage', onStorage);
  stopTokenSync = () => {
    window.removeEventListener('storage', onStorage);
    stopTokenSync = null;
  };
  return stopTokenSync;
}

// Installed at module load: `authRefresh` is pulled in by `apiClient`,
// so any consumer that talks to the API at all gets the sync without
// having to wire up a lifecycle hook.
startCrossTabTokenSync();

/** Test seam: drops any shared in-flight promise between cases. */
export function __resetAuthRefreshStateForTests(): void {
  inflight = null;
}
