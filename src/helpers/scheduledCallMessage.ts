import type { IMessage } from '../types/types';
import type {
  ScheduledCallKind,
  ScheduledCallMessageStatus,
  ScheduledCallMeta,
} from '../types/models/scheduledCall.model';
import {
  DEFAULT_DURATION_MINUTES,
  isValidScheduledCallSlug,
  safeCalendarLink,
  toEpochMs,
} from '../calls/scheduledCall';

// The backend announces a scheduled call (and every later edit or cancel) as a
// room message whose <data> element carries:
//   type="scheduledCall" scheduledCallSlug scheduledCallTitle
//   scheduledCallStartAt scheduledCallDurationMinutes scheduledCallKind
//   scheduledCallStatus scheduledCallCreatedBy scheduledCall{Join,Ics,Google,Outlook}Url
// createMessageFromXml spreads those attributes onto the message, so they are
// read off the message root here. The body is a readable fallback, which is
// what clients that do not know this type show.

export const SCHEDULED_CALL_MESSAGE_TYPE = 'scheduledCall';

const asString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const STATUSES: ScheduledCallMessageStatus[] = [
  'scheduled',
  'updated',
  'cancelled',
];

/**
 * Reads the scheduled-call fields off a message. Null when the message is not
 * one, or when it lacks what a card cannot do without (a valid slug and a
 * parseable start); such a message falls back to its plain body.
 *
 * `apiBaseUrl` is the API the chat talks to, used to vet the .ics link.
 */
export const parseScheduledCallMeta = (
  message: unknown,
  apiBaseUrl?: string | null
): ScheduledCallMeta | null => {
  const raw = message as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw !== 'object') return null;
  if (asString(raw.type) !== SCHEDULED_CALL_MESSAGE_TYPE) return null;

  const slug = asString(raw.scheduledCallSlug);
  if (!isValidScheduledCallSlug(slug)) return null;

  const startAt = asString(raw.scheduledCallStartAt);
  if (!Number.isFinite(toEpochMs(startAt))) return null;

  const duration = Math.round(Number(raw.scheduledCallDurationMinutes));
  const statusRaw = asString(raw.scheduledCallStatus).toLowerCase();
  const status = STATUSES.includes(statusRaw as ScheduledCallMessageStatus)
    ? (statusRaw as ScheduledCallMessageStatus)
    : 'scheduled';
  const kind: ScheduledCallKind =
    asString(raw.scheduledCallKind).toLowerCase() === 'audio'
      ? 'audio'
      : 'video';

  const context = { slug, apiBaseUrl };
  const meta: ScheduledCallMeta = {
    slug,
    title: asString(raw.scheduledCallTitle),
    startAt: new Date(startAt).toISOString(),
    durationMinutes:
      Number.isFinite(duration) && duration > 0
        ? duration
        : DEFAULT_DURATION_MINUTES,
    kind,
    status,
  };
  const createdBy = asString(raw.scheduledCallCreatedBy);
  if (createdBy) meta.createdBy = createdBy;
  const joinUrl = asString(raw.scheduledCallJoinUrl);
  if (joinUrl) meta.joinUrl = joinUrl;
  const ics = safeCalendarLink('ics', raw.scheduledCallIcsUrl, context);
  if (ics) meta.icsUrl = ics;
  const google = safeCalendarLink('google', raw.scheduledCallGoogleUrl, context);
  if (google) meta.googleUrl = google;
  const outlook = safeCalendarLink(
    'outlook',
    raw.scheduledCallOutlookUrl,
    context
  );
  if (outlook) meta.outlookUrl = outlook;
  return meta;
};

/**
 * createMessageFromXml hook: attaches `scheduledCall` meta to a message that
 * is one. Everything else comes back untouched (same object).
 */
export const attachScheduledCallMeta = (
  message: IMessage,
  apiBaseUrl?: string | null
): IMessage => {
  const meta = parseScheduledCallMeta(message, apiBaseUrl);
  return meta ? { ...message, scheduledCall: meta } : message;
};

const messageTime = (message: IMessage): number => {
  const ms = Number(message.messageTimestampMs);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const parsed = new Date(message.date as string).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * One card per slug: of all messages that announce the same scheduled call
 * only the newest stays, so an `updated` or `cancelled` message replaces the
 * card instead of stacking under it. Order of everything else is kept, and the
 * input is returned as is when no call is announced twice.
 */
export const collapseScheduledCallMessages = (
  messages: IMessage[]
): IMessage[] => {
  let seenAny = false;
  const newest = new Map<string, { index: number; time: number }>();
  let hasDuplicate = false;

  for (let i = 0; i < messages.length; i++) {
    const slug = messages[i]?.scheduledCall?.slug;
    if (!slug) continue;
    seenAny = true;
    const time = messageTime(messages[i]);
    const current = newest.get(slug);
    if (!current) {
      newest.set(slug, { index: i, time });
      continue;
    }
    hasDuplicate = true;
    if (time >= current.time) newest.set(slug, { index: i, time });
  }
  if (!seenAny || !hasDuplicate) return messages;

  return messages.filter((message, index) => {
    const slug = message?.scheduledCall?.slug;
    return !slug || newest.get(slug)?.index === index;
  });
};
