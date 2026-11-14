import { describe, expect, it } from 'vitest';
import {
  formatSuspensionUntil,
  parseAccountBlockedError,
  supportContactHref,
  supportContactLabel,
  suspensionReasonKey,
} from './accountBlocked';

const apiError = (status: number, data: unknown) => ({
  response: { status, data },
});

const SUSPENDED_BODY = {
  success: false,
  error: 'This account has been suspended.',
  code: 'USER_SUSPENDED',
  details: {
    suspension: {
      reasonCode: 'spam',
      message: 'Repeated unsolicited messages.',
      suspendedAt: '2026-11-01T10:00:00.000Z',
      until: '2026-12-01T10:00:00.000Z',
      supportContact: 'support@example.com',
    },
  },
  requestId: 'req-1',
};

describe('parseAccountBlockedError', () => {
  it('reads a USER_SUSPENDED refusal with its details', () => {
    expect(parseAccountBlockedError(apiError(403, SUSPENDED_BODY))).toEqual({
      blocked: 'suspended',
      code: 'USER_SUSPENDED',
      suspension: {
        reasonCode: 'spam',
        message: 'Repeated unsolicited messages.',
        suspendedAt: '2026-11-01T10:00:00.000Z',
        until: '2026-12-01T10:00:00.000Z',
        supportContact: 'support@example.com',
      },
    });
  });

  it('reads a USER_ARCHIVED refusal without details', () => {
    expect(
      parseAccountBlockedError(
        apiError(403, { success: false, code: 'USER_ARCHIVED', error: 'x' })
      )
    ).toEqual({ blocked: 'archived', code: 'USER_ARCHIVED' });
  });

  it('normalises missing and empty suspension fields to null and "other"', () => {
    const info = parseAccountBlockedError(
      apiError(403, {
        code: 'USER_SUSPENDED',
        details: { suspension: { message: '   ', until: null } },
      })
    );
    expect(info?.suspension).toEqual({
      reasonCode: 'other',
      message: null,
      suspendedAt: null,
      until: null,
      supportContact: null,
    });
  });

  it('accepts the code nested under error or errors[0]', () => {
    expect(
      parseAccountBlockedError(apiError(403, { error: { code: 'USER_ARCHIVED' } }))
        ?.code
    ).toBe('USER_ARCHIVED');
    expect(
      parseAccountBlockedError(
        apiError(403, { errors: [{ code: 'USER_SUSPENDED' }] })
      )?.blocked
    ).toBe('suspended');
  });

  it('ignores a plain 403 and other errors', () => {
    expect(parseAccountBlockedError(apiError(403, { error: 'Forbidden' }))).toBeNull();
    expect(parseAccountBlockedError(apiError(401, { code: 'REFRESH_TOKEN_NOT_FOUND' }))).toBeNull();
    expect(parseAccountBlockedError(new Error('Network Error'))).toBeNull();
    expect(parseAccountBlockedError(null)).toBeNull();
    expect(parseAccountBlockedError(apiError(403, 'USER_SUSPENDED'))).toBeNull();
  });
});

describe('suspensionReasonKey', () => {
  it.each([
    ['child_safety'],
    ['terms_violation'],
    ['spam'],
    ['security'],
    ['other'],
  ])('maps %s to its own label', (code) => {
    expect(suspensionReasonKey(code)).toBe(`account.suspended.reason.${code}`);
  });

  it('maps unknown and missing codes to "other"', () => {
    expect(suspensionReasonKey('something_new')).toBe('account.suspended.reason.other');
    expect(suspensionReasonKey(null)).toBe('account.suspended.reason.other');
  });
});

describe('supportContactHref', () => {
  it('turns an e-mail address into a mailto: link', () => {
    expect(supportContactHref('support@example.com')).toBe(
      'mailto:support@example.com'
    );
    expect(supportContactHref('mailto:help@example.com')).toBe(
      'mailto:help@example.com'
    );
  });

  it('links http(s) URLs as they are, even with an @ in the path', () => {
    expect(supportContactHref('https://example.com/help')).toBe(
      'https://example.com/help'
    );
    expect(supportContactHref('https://example.com/@support')).toBe(
      'https://example.com/@support'
    );
  });

  it('adds https:// to a bare host', () => {
    expect(supportContactHref('example.com/help')).toBe('https://example.com/help');
  });

  it('never links other schemes', () => {
    expect(supportContactHref('javascript:alert(1)')).toBeNull();
    expect(supportContactHref('javascript:alert("a@b")')).toBeNull();
    expect(supportContactHref('data:text/html,hi')).toBeNull();
  });

  it('returns null for nothing', () => {
    expect(supportContactHref(null)).toBeNull();
    expect(supportContactHref('  ')).toBeNull();
  });

  it('shows an address without its mailto: prefix', () => {
    expect(supportContactLabel('mailto:help@example.com')).toBe('help@example.com');
    expect(supportContactLabel('https://example.com')).toBe('https://example.com');
  });
});

describe('formatSuspensionUntil', () => {
  it('formats a valid date', () => {
    const text = formatSuspensionUntil('2026-12-01T10:00:00.000Z', 'en');
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/Dec/);
  });

  it('returns null for no date or an unreadable one', () => {
    expect(formatSuspensionUntil(null)).toBeNull();
    expect(formatSuspensionUntil('not a date')).toBeNull();
  });
});
