import { store } from '../roomStore';
import { setAccountBlocked } from '../roomStore/chatSettingsSlice';
import {
  AccountBlockedInfo,
  parseAccountBlockedError,
} from '../helpers/accountBlocked';

/**
 * Store wiring for suspended and archived accounts. Every API error passes
 * through `reportAccountBlockedError` (apiClient's response interceptor and
 * the host refresh function), which is the ONE place the block is set.
 *
 * Once it is set the client goes quiet: apiClient refuses further requests
 * locally (see `isRequestAllowedWhileBlocked`), token refresh refuses to
 * run, the XMPP client stops reconnecting, and the chat shows the notice.
 */

export const getAccountBlockedInfo = (): AccountBlockedInfo | null => {
  try {
    const status = store.getState().chatSettingStore?.accountStatus;
    if (!status) return null;
    const info: AccountBlockedInfo = { blocked: status.blocked, code: status.code };
    if (status.suspension) info.suspension = status.suspension;
    return info;
  } catch {
    // Some unit tests replace the store with a partial stub.
    return null;
  }
};

export const isAccountBlocked = (): boolean => getAccountBlockedInfo() !== null;

/**
 * Flags the account when `error` is a USER_SUSPENDED / USER_ARCHIVED answer.
 * Returns the parsed block, or null for any other error. Dispatches only
 * when something changed, so a burst of refused requests is one update.
 */
export const reportAccountBlockedError = (
  error: unknown
): AccountBlockedInfo | null => {
  const info = parseAccountBlockedError(error);
  if (!info) return null;

  const current = getAccountBlockedInfo();
  if (!current || JSON.stringify(current) !== JSON.stringify(info)) {
    try {
      store.dispatch(setAccountBlocked(info));
    } catch (dispatchError) {
      console.warn('[accountBlocked] failed to record block', dispatchError);
    }
  }
  return info;
};

/**
 * Rejection used for work the client refuses to start while the account is
 * blocked. It carries the same `response` shape as the server's refusal, so
 * callers that already handle a 403 treat it the same way.
 */
export class AccountBlockedError extends Error {
  code: AccountBlockedInfo['code'];
  info: AccountBlockedInfo;
  response: {
    status: number;
    data: {
      code: AccountBlockedInfo['code'];
      error: string;
      details?: { suspension: AccountBlockedInfo['suspension'] };
    };
  };
  config?: unknown;
  /** Never sent: refused on the client because the account is blocked. */
  readonly isLocalAccountBlock = true;

  constructor(info: AccountBlockedInfo, config?: unknown) {
    const message =
      info.blocked === 'suspended'
        ? 'This account has been suspended.'
        : 'This account is no longer active.';
    super(message);
    this.name = 'AccountBlockedError';
    this.code = info.code;
    this.info = info;
    this.config = config;
    this.response = {
      status: 403,
      data: {
        code: info.code,
        error: message,
        ...(info.suspension
          ? { details: { suspension: info.suspension } }
          : {}),
      },
    };
    Object.setPrototypeOf(this, AccountBlockedError.prototype);
  }
}

export const isAccountBlockedError = (
  error: unknown
): error is AccountBlockedError =>
  error instanceof AccountBlockedError ||
  (error as AccountBlockedError)?.name === 'AccountBlockedError';

/** The error to reject with when the account is already blocked. */
export const accountBlockedRejection = (
  config?: unknown
): AccountBlockedError | null => {
  const info = getAccountBlockedInfo();
  return info ? new AccountBlockedError(info, config) : null;
};

// Sign-in endpoints start a NEW session, so they stay open while blocked:
// signing in as another account must still work, and the same account is
// simply refused again by the server. Token refresh is not one of them.
const SESSION_START_PATH = /\/v[12]\/users\/(login-with-email|login|client)\/?$/i;

const pathOf = (url?: string): string =>
  (url || '')
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '')
    .split(/[?#]/)[0]
    .replace(/^\/*/, '/');

export const isSessionStartRequest = (url?: string): boolean =>
  SESSION_START_PATH.test(pathOf(url));

export const isRequestAllowedWhileBlocked = (url?: string): boolean =>
  isSessionStartRequest(url);
