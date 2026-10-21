import { getScheduledCallEndMs, toEpochMs } from './scheduledCall';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

const safeFormat = (
  date: Date,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
  fallback: string
): string => {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return fallback;
  }
};

/** "Wed, Oct 22" in the viewer's local time zone and the UI locale. */
export const formatScheduledDay = (
  startAt: string,
  locale?: string
): string => {
  const date = new Date(startAt);
  return safeFormat(
    date,
    locale,
    { weekday: 'short', month: 'short', day: 'numeric' },
    date.toDateString()
  );
};

/** "3:00 PM - 3:30 PM" (end time only when it can be computed). */
export const formatScheduledTimeRange = (
  call: { startAt: string; durationMinutes: number },
  locale?: string
): string => {
  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  };
  const start = new Date(call.startAt);
  const from = safeFormat(start, locale, options, start.toLocaleTimeString());
  const endMs = getScheduledCallEndMs(call);
  if (!Number.isFinite(endMs) || !Number.isFinite(toEpochMs(call.startAt))) {
    return from;
  }
  const end = new Date(endMs);
  return `${from} - ${safeFormat(end, locale, options, end.toLocaleTimeString())}`;
};

/** Clock time of an instant, e.g. when the join window opens. */
export const formatClockTime = (ms: number, locale?: string): string => {
  const date = new Date(ms);
  return safeFormat(
    date,
    locale,
    { hour: 'numeric', minute: '2-digit' },
    date.toLocaleTimeString()
  );
};

/** "30 min", "2 h", "1 h 30 min". */
export const formatScheduledDuration = (
  minutes: number,
  t: Translate
): string => {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return t('scheduledCall.duration.min', { n: rest });
  if (rest === 0) return t('scheduledCall.duration.hour', { n: hours });
  return t('scheduledCall.duration.hourMin', { h: hours, m: rest });
};
