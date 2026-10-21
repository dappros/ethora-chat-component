// Pure helpers for scheduled calls: the join window, the schedule form maths
// and the deep-link parser. No React, no store, no network, so every rule the
// card, the pre-join panel and the schedule modal share is testable alone.

import type {
  ScheduledCall,
  ScheduledCallKind,
} from '../types/models/scheduledCall.model';

/** Join opens this many minutes before the start (contract: 15). */
export const JOIN_LEAD_MINUTES = 15;

/** Server bounds (contract: duration 5..480, title 1..200, description 0..2000). */
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 480;
export const DEFAULT_DURATION_MINUTES = 30;
export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;

/** The server accepts a start up to 2 minutes in the past (clock skew). */
export const START_SKEW_MS = 2 * 60 * 1000;

/** Durations offered by the schedule form. */
export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;

export type ScheduledCallPhase =
  | 'upcoming' // before the join window opens
  | 'joinable' // from JOIN_LEAD_MINUTES before the start until the end
  | 'ended'
  | 'cancelled';

type PhaseInput = Pick<ScheduledCall, 'startAt' | 'durationMinutes'> & {
  status: 'scheduled' | 'updated' | 'cancelled';
};

const MINUTE_MS = 60 * 1000;

/** Epoch ms of an ISO string; NaN when it does not parse. */
export const toEpochMs = (iso: string | undefined | null): number =>
  iso ? new Date(iso).getTime() : NaN;

export const getScheduledCallEndMs = (
  call: Pick<ScheduledCall, 'startAt' | 'durationMinutes'>
): number => toEpochMs(call.startAt) + call.durationMinutes * MINUTE_MS;

/** When the Join button becomes available (epoch ms). */
export const getJoinOpensAtMs = (
  call: Pick<ScheduledCall, 'startAt'>
): number => toEpochMs(call.startAt) - JOIN_LEAD_MINUTES * MINUTE_MS;

/**
 * Where a call is in its life. A call whose start does not parse is treated as
 * ended, never joinable: the Join button must not guess.
 */
export const getScheduledCallPhase = (
  call: PhaseInput,
  now: number = Date.now()
): ScheduledCallPhase => {
  if (call.status === 'cancelled') return 'cancelled';
  const start = toEpochMs(call.startAt);
  if (!Number.isFinite(start)) return 'ended';
  const duration = Number.isFinite(call.durationMinutes)
    ? call.durationMinutes
    : DEFAULT_DURATION_MINUTES;
  if (now >= start + duration * MINUTE_MS) return 'ended';
  if (now >= start - JOIN_LEAD_MINUTES * MINUTE_MS) return 'joinable';
  return 'upcoming';
};

/** Minutes until the join window opens, rounded up; 0 once it is open. */
export const minutesUntilJoinOpens = (
  call: Pick<ScheduledCall, 'startAt'>,
  now: number = Date.now()
): number => {
  const remaining = getJoinOpensAtMs(call) - now;
  return remaining > 0 ? Math.ceil(remaining / MINUTE_MS) : 0;
};

// ---------------------------------------------------------------------------
// Schedule form

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` in the local time zone, the value of an <input type="date">. */
export const toLocalDateInput = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** `HH:mm` in the local time zone, the value of an <input type="time">. */
export const toLocalTimeInput = (date: Date): string =>
  `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

/**
 * Local `YYYY-MM-DD` + `HH:mm` -> Date. Null when either part is malformed or
 * names a date that does not exist (Feb 30 would otherwise roll into March).
 */
export const combineLocalDateTime = (
  dateValue: string,
  timeValue: string
): Date | null => {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue || '');
  const t = /^(\d{2}):(\d{2})$/.exec(timeValue || '');
  if (!d || !t) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hours, minutes] = [Number(t[1]), Number(t[2])];
  const out = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    out.getFullYear() !== year ||
    out.getMonth() !== month - 1 ||
    out.getDate() !== day ||
    out.getHours() !== hours ||
    out.getMinutes() !== minutes
  ) {
    return null;
  }
  return out;
};

/** The default start of a new call: the next quarter hour, at least 15 min ahead. */
export const defaultScheduleStart = (now: Date = new Date()): Date => {
  const ms = now.getTime() + 15 * MINUTE_MS;
  const quarter = 15 * MINUTE_MS;
  return new Date(Math.ceil(ms / quarter) * quarter);
};

export interface ScheduleFormValues {
  title: string;
  description: string;
  /** `YYYY-MM-DD`, local. */
  date: string;
  /** `HH:mm`, local. */
  time: string;
  durationMinutes: number;
  kind: ScheduledCallKind;
}

export type ScheduleFormErrorKey =
  | 'title'
  | 'description'
  | 'start'
  | 'startPast'
  | 'duration';

export type ScheduleFormErrors = Partial<Record<ScheduleFormErrorKey, true>>;

/**
 * Client-side mirror of the server rules, so the form can say what is wrong
 * before a round trip. `skipPastCheck` is for editing a call that already
 * started or whose time is left unchanged.
 */
export const validateScheduleForm = (
  values: ScheduleFormValues,
  now: number = Date.now(),
  options?: { skipPastCheck?: boolean }
): ScheduleFormErrors => {
  const errors: ScheduleFormErrors = {};
  if (values.title.trim().length > MAX_TITLE_LENGTH) errors.title = true;
  if (values.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = true;
  }
  const start = combineLocalDateTime(values.date, values.time);
  if (!start) {
    errors.start = true;
  } else if (!options?.skipPastCheck && start.getTime() < now - START_SKEW_MS) {
    errors.startPast = true;
  }
  const duration = values.durationMinutes;
  if (
    !Number.isInteger(duration) ||
    duration < MIN_DURATION_MINUTES ||
    duration > MAX_DURATION_MINUTES
  ) {
    errors.duration = true;
  }
  return errors;
};

/** Presets plus the call's own duration when it is not one of them (edit). */
export const durationOptions = (current?: number): number[] => {
  const options: number[] = [...DURATION_PRESETS];
  if (
    typeof current === 'number' &&
    Number.isInteger(current) &&
    current >= MIN_DURATION_MINUTES &&
    current <= MAX_DURATION_MINUTES &&
    !options.includes(current)
  ) {
    options.push(current);
    options.sort((a, b) => a - b);
  }
  return options;
};

export const localTimeZone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

// ---------------------------------------------------------------------------
// Deep link

// The contract says 22+ url-safe characters; accept a little shorter (16+) so a
// backend that trims its encoding does not break every link. Same as the RN SDK.
const SLUG_RE = /^[A-Za-z0-9_-]{16,128}$/;
const LINK_RE =
  /^(?:(https):\/\/([^/?#]+)\/|([a-z][a-z0-9+.-]*):\/\/\/?)call\/([A-Za-z0-9_-]{16,128})(?:[/?#]|$)/i;
const NEVER_SCHEMES = new Set(['javascript', 'data', 'file', 'blob', 'about', 'vbscript']);

export interface ScheduledCallLinkOptions {
  /** Hosts accepted for `https://<host>/call/<slug>`. Empty or unset: any host. */
  hosts?: string[];
  /** Schemes accepted for `<scheme>://call/<slug>`. Empty or unset: any scheme. */
  schemes?: string[];
}

const bareHost = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
const bareScheme = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/:\/\/.*$/, '')
    .replace(/:$/, '');

export const isValidScheduledCallSlug = (value: unknown): value is string =>
  typeof value === 'string' && SLUG_RE.test(value);

/**
 * The slug of a scheduled-call join link, or null when `url` is not one.
 * Accepts the canonical `https://<host>/call/<slug>` and the app-scheme form
 * `<scheme>://call/<slug>`. `options.hosts` / `options.schemes` narrow what is
 * accepted (plain http and script-like schemes never are). Same name and
 * contract as the React Native SDK.
 */
export const parseScheduledCallLink = (
  url: unknown,
  options?: ScheduledCallLinkOptions
): string | null => {
  if (typeof url !== 'string') return null;
  const match = LINK_RE.exec(url.trim());
  if (!match) return null;
  const [, https, authority, scheme, slug] = match;
  if (https) {
    if (authority.includes('@')) return null;
    const hosts = (options?.hosts || []).map(bareHost).filter(Boolean);
    if (hosts.length > 0 && !hosts.includes(bareHost(authority))) return null;
    return slug;
  }
  const lower = scheme.toLowerCase();
  if (lower === 'http' || NEVER_SCHEMES.has(lower)) return null;
  const schemes = (options?.schemes || []).map(bareScheme).filter(Boolean);
  if (schemes.length > 0 && !schemes.includes(lower)) return null;
  return slug;
};

// ---------------------------------------------------------------------------
// Links from a room message

const CALENDAR_HOSTS = {
  google: ['calendar.google.com', 'www.google.com'],
  outlook: [
    'outlook.live.com',
    'outlook.office.com',
    'outlook.office365.com',
  ],
} as const;

const parseHttpUrl = (value: unknown): URL | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
};

/**
 * Link attributes ride on a room message any member could forge, so a button
 * only gets a link that is plausible for what it says it is: http(s) only
 * (never `javascript:`), the calendar buttons only on the calendar providers'
 * own hosts, and the .ics link only on the API host the chat already talks to
 * (when that is known) and for this call's slug.
 */
export const safeCalendarLink = (
  kind: 'google' | 'outlook' | 'ics',
  value: unknown,
  context: { slug: string; apiBaseUrl?: string | null }
): string | null => {
  const url = parseHttpUrl(value);
  if (!url) return null;
  if (kind === 'google' || kind === 'outlook') {
    const hosts: readonly string[] = CALENDAR_HOSTS[kind];
    return url.protocol === 'https:' && hosts.includes(url.hostname)
      ? url.toString()
      : null;
  }
  if (!url.pathname.endsWith(`/calls/scheduled/${context.slug}.ics`)) {
    return null;
  }
  const api = parseHttpUrl(context.apiBaseUrl);
  if (api && api.origin !== url.origin) return null;
  return url.toString();
};

/**
 * A link from the authenticated API (the pre-join panel). Trusted as far as
 * the origin goes, but still http(s) only.
 */
export const httpLinkOrNull = (value: unknown): string | null =>
  parseHttpUrl(value)?.toString() ?? null;

/**
 * The title to show. The backend defaults an omitted title to the English
 * word `Call`, so that exact value (and an empty one) is shown in the viewer's
 * language instead.
 */
export const displayCallTitle = (
  title: string | undefined | null,
  defaultTitle: string
): string => {
  const value = String(title ?? '').trim();
  return !value || value === 'Call' ? defaultTitle : value;
};
