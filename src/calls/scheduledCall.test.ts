import { describe, expect, it } from 'vitest';
import {
  DURATION_PRESETS,
  JOIN_LEAD_MINUTES,
  combineLocalDateTime,
  defaultScheduleStart,
  displayCallTitle,
  durationOptions,
  getJoinOpensAtMs,
  getScheduledCallPhase,
  httpLinkOrNull,
  isValidScheduledCallSlug,
  minutesUntilJoinOpens,
  parseScheduledCallLink,
  safeCalendarLink,
  toLocalDateInput,
  toLocalTimeInput,
  validateScheduleForm,
} from './scheduledCall';

const SLUG = 'abcdefghijklmnopqrstuv';
const START = '2026-10-22T15:00:00.000Z';
const startMs = new Date(START).getTime();
const MIN = 60_000;
const call = (over: Record<string, unknown> = {}) => ({
  startAt: START,
  durationMinutes: 30,
  status: 'scheduled' as const,
  ...over,
});

describe('getScheduledCallPhase', () => {
  it('is upcoming until the join window opens', () => {
    expect(getScheduledCallPhase(call(), startMs - 16 * MIN)).toBe('upcoming');
  });

  it('opens 15 minutes before the start, to the minute', () => {
    expect(JOIN_LEAD_MINUTES).toBe(15);
    expect(getScheduledCallPhase(call(), startMs - 15 * MIN - 1)).toBe('upcoming');
    expect(getScheduledCallPhase(call(), startMs - 15 * MIN)).toBe('joinable');
  });

  it('stays joinable through the start and until start + duration', () => {
    expect(getScheduledCallPhase(call(), startMs)).toBe('joinable');
    expect(getScheduledCallPhase(call(), startMs + 30 * MIN - 1)).toBe('joinable');
    expect(getScheduledCallPhase(call(), startMs + 30 * MIN)).toBe('ended');
  });

  it('cancelled wins over any time', () => {
    expect(
      getScheduledCallPhase(call({ status: 'cancelled' }), startMs)
    ).toBe('cancelled');
  });

  it('treats an `updated` message like a scheduled one', () => {
    expect(getScheduledCallPhase(call({ status: 'updated' }), startMs)).toBe(
      'joinable'
    );
  });

  it('never calls an unparseable start joinable', () => {
    expect(getScheduledCallPhase(call({ startAt: 'nope' }), startMs)).toBe('ended');
  });
});

describe('join window helpers', () => {
  it('counts minutes until the window opens, rounded up', () => {
    expect(minutesUntilJoinOpens(call(), startMs - 15 * MIN - 90_000)).toBe(2);
    expect(minutesUntilJoinOpens(call(), startMs)).toBe(0);
    expect(getJoinOpensAtMs(call())).toBe(startMs - 15 * MIN);
  });
});

describe('combineLocalDateTime', () => {
  it('builds a local date', () => {
    const d = combineLocalDateTime('2026-10-22', '09:05')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
      2026, 9, 22, 9, 5,
    ]);
  });

  it('rejects malformed input and dates that do not exist', () => {
    expect(combineLocalDateTime('', '09:00')).toBeNull();
    expect(combineLocalDateTime('2026-10-22', '')).toBeNull();
    expect(combineLocalDateTime('2026-02-30', '09:00')).toBeNull();
    expect(combineLocalDateTime('2026-10-22', '25:00')).toBeNull();
  });

  it('round-trips through the input formatters', () => {
    const d = new Date(2026, 0, 5, 7, 8);
    expect(toLocalDateInput(d)).toBe('2026-01-05');
    expect(toLocalTimeInput(d)).toBe('07:08');
  });
});

describe('defaultScheduleStart', () => {
  it('is on a quarter hour, at least 15 minutes ahead', () => {
    const now = new Date(2026, 9, 22, 10, 1, 30);
    const start = defaultScheduleStart(now);
    expect(start.getMinutes() % 15).toBe(0);
    expect(start.getTime() - now.getTime()).toBeGreaterThanOrEqual(15 * MIN);
    expect(start.getTime() - now.getTime()).toBeLessThan(30 * MIN + 1);
  });
});

describe('validateScheduleForm', () => {
  const now = new Date(2026, 9, 22, 10, 0).getTime();
  const base = {
    title: 'Sync',
    description: '',
    date: '2026-10-22',
    time: '11:00',
    durationMinutes: 30,
    kind: 'video' as const,
  };

  it('accepts a good form', () => {
    expect(validateScheduleForm(base, now)).toEqual({});
  });

  it('rejects a start in the past but allows the 2 minute skew', () => {
    expect(validateScheduleForm({ ...base, time: '09:00' }, now)).toEqual({
      startPast: true,
    });
    expect(validateScheduleForm({ ...base, time: '09:59' }, now)).toEqual({});
  });

  it('can skip the past check when the time is left unchanged', () => {
    expect(
      validateScheduleForm({ ...base, time: '09:00' }, now, { skipPastCheck: true })
    ).toEqual({});
  });

  it('flags a missing date', () => {
    expect(validateScheduleForm({ ...base, date: '' }, now)).toEqual({ start: true });
  });

  it('enforces the duration bounds 5..480', () => {
    expect(validateScheduleForm({ ...base, durationMinutes: 4 }, now).duration).toBe(true);
    expect(validateScheduleForm({ ...base, durationMinutes: 5 }, now).duration).toBeUndefined();
    expect(validateScheduleForm({ ...base, durationMinutes: 480 }, now).duration).toBeUndefined();
    expect(validateScheduleForm({ ...base, durationMinutes: 481 }, now).duration).toBe(true);
    expect(validateScheduleForm({ ...base, durationMinutes: 30.5 }, now).duration).toBe(true);
  });

  it('enforces title and description length', () => {
    expect(validateScheduleForm({ ...base, title: 'x'.repeat(201) }, now).title).toBe(true);
    expect(validateScheduleForm({ ...base, title: 'x'.repeat(200) }, now).title).toBeUndefined();
    expect(
      validateScheduleForm({ ...base, description: 'x'.repeat(2001) }, now).description
    ).toBe(true);
  });
});

describe('durationOptions', () => {
  it('lists the presets', () => {
    expect(durationOptions()).toEqual([...DURATION_PRESETS]);
  });
  it('adds a call own duration that is not a preset, sorted', () => {
    expect(durationOptions(50)).toEqual([15, 30, 45, 50, 60, 90, 120]);
    expect(durationOptions(60)).toEqual([...DURATION_PRESETS]);
    expect(durationOptions(9999)).toEqual([...DURATION_PRESETS]);
  });
});

describe('parseScheduledCallLink', () => {
  it('reads the canonical https link', () => {
    expect(parseScheduledCallLink(`https://app.chat.ethora.com/call/${SLUG}`)).toBe(SLUG);
    expect(parseScheduledCallLink(`https://app.chat.ethora.com/call/${SLUG}?x=1#y`)).toBe(SLUG);
    expect(parseScheduledCallLink(`https://app.chat.ethora.com/call/${SLUG}/`)).toBe(SLUG);
  });

  it('reads an app scheme link', () => {
    expect(parseScheduledCallLink(`ethoraappreactnative://call/${SLUG}`)).toBe(SLUG);
    expect(parseScheduledCallLink(`ethoraappreactnative:///call/${SLUG}`)).toBe(SLUG);
  });

  it('rejects everything else', () => {
    expect(parseScheduledCallLink('')).toBeNull();
    expect(parseScheduledCallLink(null)).toBeNull();
    expect(parseScheduledCallLink('https://app.chat.ethora.com/app/chat')).toBeNull();
    expect(parseScheduledCallLink('https://app.chat.ethora.com/call/short')).toBeNull();
    expect(parseScheduledCallLink('https://app.chat.ethora.com/call/' + 'a'.repeat(15))).toBeNull();
    expect(parseScheduledCallLink('https://app.chat.ethora.com/call/' + 'a'.repeat(16))).toBe('a'.repeat(16));
    expect(parseScheduledCallLink(`https://app.chat.ethora.com/other/call/${SLUG}`)).toBeNull();
    expect(parseScheduledCallLink(`javascript:alert(1)//call/${SLUG}`)).toBeNull();
    expect(parseScheduledCallLink(`https://x.com/call/${SLUG}extra!`)).toBeNull();
  });

  it('narrows to the configured hosts and schemes, like the RN SDK', () => {
    const hosts = ['app.chat.ethora.com'];
    expect(parseScheduledCallLink(`https://app.chat.ethora.com/call/${SLUG}`, { hosts })).toBe(SLUG);
    expect(parseScheduledCallLink(`https://APP.chat.ethora.com:443/call/${SLUG}`, { hosts })).toBe(SLUG);
    expect(parseScheduledCallLink(`https://evil.example/call/${SLUG}`, { hosts })).toBeNull();
    const schemes = ['ethoraappreactnative'];
    expect(parseScheduledCallLink(`ethoraappreactnative://call/${SLUG}`, { schemes })).toBe(SLUG);
    expect(parseScheduledCallLink(`other://call/${SLUG}`, { schemes })).toBeNull();
  });

  it('never accepts plain http, credentials in the host or script-like schemes', () => {
    expect(parseScheduledCallLink(`http://app.chat.ethora.com/call/${SLUG}`)).toBeNull();
    expect(parseScheduledCallLink(`http://call/${SLUG}`)).toBeNull();
    expect(parseScheduledCallLink(`https://user@app.chat.ethora.com/call/${SLUG}`)).toBeNull();
    expect(parseScheduledCallLink(`javascript://call/${SLUG}`)).toBeNull();
  });

  it('validates slugs', () => {
    expect(isValidScheduledCallSlug(SLUG)).toBe(true);
    expect(isValidScheduledCallSlug('a-b_c'.repeat(5))).toBe(true);
    expect(isValidScheduledCallSlug('short')).toBe(false);
    expect(isValidScheduledCallSlug('has space has space has')).toBe(false);
    expect(isValidScheduledCallSlug(5)).toBe(false);
  });
});

describe('safeCalendarLink', () => {
  const ctx = { slug: SLUG, apiBaseUrl: 'https://api.chat.ethora.com' };

  it('takes provider links only on the provider hosts, over https', () => {
    expect(
      safeCalendarLink('google', 'https://calendar.google.com/calendar/render?action=TEMPLATE', ctx)
    ).toContain('calendar.google.com');
    expect(
      safeCalendarLink('outlook', 'https://outlook.live.com/calendar/0/deeplink/compose', ctx)
    ).toContain('outlook.live.com');
    expect(safeCalendarLink('google', 'https://evil.example/calendar', ctx)).toBeNull();
    expect(safeCalendarLink('google', 'http://calendar.google.com/x', ctx)).toBeNull();
    expect(safeCalendarLink('outlook', 'https://calendar.google.com/x', ctx)).toBeNull();
  });

  it('refuses non-http schemes and junk', () => {
    expect(safeCalendarLink('google', 'javascript:alert(1)', ctx)).toBeNull();
    expect(safeCalendarLink('ics', 'data:text/calendar,x', ctx)).toBeNull();
    expect(safeCalendarLink('ics', '', ctx)).toBeNull();
    expect(safeCalendarLink('ics', undefined, ctx)).toBeNull();
  });

  it('takes the .ics link only for this slug and the API origin', () => {
    const good = `https://api.chat.ethora.com/v1/calls/scheduled/${SLUG}.ics`;
    expect(safeCalendarLink('ics', good, ctx)).toBe(good);
    expect(
      safeCalendarLink('ics', `https://evil.example/v1/calls/scheduled/${SLUG}.ics`, ctx)
    ).toBeNull();
    expect(
      safeCalendarLink('ics', 'https://api.chat.ethora.com/v1/calls/scheduled/other-slug.ics', ctx)
    ).toBeNull();
  });

  it('skips the origin check when the API base is unknown', () => {
    const url = `https://api.example.com/v1/calls/scheduled/${SLUG}.ics`;
    expect(safeCalendarLink('ics', url, { slug: SLUG })).toBe(url);
  });

  it('httpLinkOrNull only passes http(s)', () => {
    expect(httpLinkOrNull('https://a.example/x')).toBe('https://a.example/x');
    expect(httpLinkOrNull('javascript:1')).toBeNull();
  });
});

describe('displayCallTitle', () => {
  it('shows a real title as is', () => {
    expect(displayCallTitle('Weekly sync', 'Appel')).toBe('Weekly sync');
  });
  it('localizes the backend default (the English word Call) and an empty title', () => {
    expect(displayCallTitle('Call', 'Appel')).toBe('Appel');
    expect(displayCallTitle('', 'Appel')).toBe('Appel');
    expect(displayCallTitle(undefined, 'Appel')).toBe('Appel');
  });
});
