/**
 * Suspended and archived accounts.
 *
 * The API refuses every call made by (or on behalf of) a suspended user with
 * HTTP 403 and `code: 'USER_SUSPENDED'`, plus the details the client shows
 * on its "Account suspended" screen. Archived users get 403 with
 * `code: 'USER_ARCHIVED'` and no details. The XMPP account is disabled at
 * the same time, so SASL fails with `not-authorized`; that alone says
 * nothing about suspension (an expired hourly password looks the same), so
 * only an API answer is ever trusted to flag the account.
 *
 * This module is pure: it only reads an error and builds display data. The
 * store wiring lives in `networking/accountBlockedGate.ts`.
 */

export type AccountBlockedCode = 'USER_SUSPENDED' | 'USER_ARCHIVED';

export type AccountBlockedKind = 'suspended' | 'archived';

/** Reason codes the backend sends. Anything else is shown as "Other". */
export const SUSPENSION_REASON_CODES = [
  'child_safety',
  'terms_violation',
  'spam',
  'security',
  'other',
] as const;

export type SuspensionReasonCode = (typeof SUSPENSION_REASON_CODES)[number];

export interface AccountSuspensionDetails {
  /** One of `SUSPENSION_REASON_CODES`; an unknown value is kept as sent. */
  reasonCode: string;
  /** Optional text the administrator chose to show to the user. */
  message: string | null;
  /** ISO date the suspension started. */
  suspendedAt: string | null;
  /** ISO date the suspension ends, or null when it is permanent. */
  until: string | null;
  /** E-mail address or URL the user can contact, or null. */
  supportContact: string | null;
}

/** What `config.onAccountBlocked` receives and the notice renders. */
export interface AccountBlockedInfo {
  blocked: AccountBlockedKind;
  code: AccountBlockedCode;
  /** Present for suspended accounts only. */
  suspension?: AccountSuspensionDetails;
}

const CODE_TO_KIND: Record<AccountBlockedCode, AccountBlockedKind> = {
  USER_SUSPENDED: 'suspended',
  USER_ARCHIVED: 'archived',
};

const isBlockedCode = (value: unknown): value is AccountBlockedCode =>
  value === 'USER_SUSPENDED' || value === 'USER_ARCHIVED';

const stringOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const readSuspension = (raw: unknown): AccountSuspensionDetails => {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    reasonCode: stringOrNull(source.reasonCode) || 'other',
    message: stringOrNull(source.message),
    suspendedAt: stringOrNull(source.suspendedAt),
    until: stringOrNull(source.until),
    supportContact: stringOrNull(source.supportContact),
  };
};

/**
 * Reads an API error (axios shape: `error.response.data`) and returns the
 * account block it reports, or null for any other error.
 *
 * Only the two codes count. A bare 403 is the normal answer for a missing
 * permission on one resource and must never block the whole chat.
 */
export const parseAccountBlockedError = (
  error: unknown
): AccountBlockedInfo | null => {
  const response = (error as { response?: { data?: unknown } } | null)
    ?.response;
  const data = response?.data as Record<string, any> | undefined;
  if (!data || typeof data !== 'object') return null;

  const code = [
    data.code,
    data.error && typeof data.error === 'object' ? data.error.code : undefined,
    Array.isArray(data.errors) ? data.errors[0]?.code : undefined,
  ].find(isBlockedCode);
  if (!code) return null;

  const info: AccountBlockedInfo = { blocked: CODE_TO_KIND[code], code };
  if (code === 'USER_SUSPENDED') {
    info.suspension = readSuspension(
      data.details?.suspension ?? data.suspension
    );
  }
  return info;
};

/** i18n key for a reason code; unknown codes use the "Other" label. */
export const suspensionReasonKey = (reasonCode?: string | null): string => {
  const known = (SUSPENSION_REASON_CODES as readonly string[]).includes(
    reasonCode || ''
  )
    ? reasonCode
    : 'other';
  return `account.suspended.reason.${known}`;
};

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Link target for the support contact, or null when it must be shown as
 * plain text.
 *
 * An http(s) URL is linked as is; anything else containing `@` becomes a
 * `mailto:` link; a bare host such as `example.com/help` gets `https://`.
 * Any other scheme (`javascript:`, `data:` and so on) is never linked.
 */
export const supportContactHref = (contact?: string | null): string | null => {
  const value = stringOrNull(contact);
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    return isParsableUrl(value) ? value : null;
  }
  if (/^mailto:/i.test(value)) {
    return value.includes('@') ? value : null;
  }
  if (value.includes('@')) {
    return HAS_SCHEME.test(value) ? null : `mailto:${value}`;
  }
  if (HAS_SCHEME.test(value)) return null;

  const withScheme = `https://${value}`;
  return isParsableUrl(withScheme) ? withScheme : null;
};

/** Text shown for the support link: the address without `mailto:`. */
export const supportContactLabel = (contact?: string | null): string =>
  (stringOrNull(contact) || '').replace(/^mailto:/i, '');

function isParsableUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The suspension end date for display, or null when there is none or it
 * cannot be read. `locale` undefined means the browser's own locale.
 */
export const formatSuspensionUntil = (
  until: string | null | undefined,
  locale?: string
): string | null => {
  if (!until) return null;
  const date = new Date(until);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleString(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    // An unknown locale tag throws a RangeError; fall back to the default.
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
};
