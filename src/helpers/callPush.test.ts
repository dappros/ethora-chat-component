import { describe, expect, it } from 'vitest';
import {
  CALL_TOKEN_MIN_REMAINING_MS,
  decodeJwtPayload,
  getCallPushFreshness,
  isCallPush,
  jwtExpiresAtMs,
  parseCallPush,
} from './callPush';

const NOW = 1_700_000_000_000;

const makeJwt = (claims: Record<string, unknown> = {}) =>
  `h.${btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.s`;

describe('parseCallPush', () => {
  it('defaults a missing kind to audio, like the server', () => {
    expect(parseCallPush({ type: 'call', callId: 'c' }).kind).toBe('audio');
    expect(parseCallPush({ type: 'call', callId: 'c', kind: 'whatever' }).kind).toBe('audio');
  });

  it('keeps an explicit kind', () => {
    expect(parseCallPush({ kind: 'video' }).kind).toBe('video');
    expect(parseCallPush({ callKind: 'video' }).kind).toBe('video');
    expect(parseCallPush({ kind: 'audio' }).kind).toBe('audio');
  });

  it('reads the backend contract fields', () => {
    const parsed = parseCallPush({
      type: 'call',
      callId: 'c-1',
      callToken: 'tok',
      room: 'app_a-app_b',
      kind: 'video',
      callerName: 'Alice',
      callerXmppUsername: 'app_a@xmpp.test',
    });
    expect(isCallPush({ type: 'call' })).toBe(true);
    expect(parsed).toMatchObject({
      callId: 'c-1',
      token: 'tok',
      roomRef: 'app_a-app_b',
      roomBareName: 'app_a-app_b',
      callerName: 'Alice',
      callerXmppUsername: 'app_a',
    });
  });
});

describe('call token expiry', () => {
  it('decodes a base64url JWT payload', () => {
    // '??>' and '~~~' encode to base64 with + and /, which base64url swaps
    const claims = { exp: 5, sub: '??>~~~' };
    expect(makeJwt(claims)).not.toMatch(/[+/=]/);
    expect(decodeJwtPayload(makeJwt(claims))).toEqual(claims);
  });

  it('reads exp as epoch milliseconds', () => {
    expect(jwtExpiresAtMs(makeJwt({ exp: 1_700_000_060 }))).toBe(1_700_000_060_000);
  });

  it.each([
    ['malformed', 'not-a-jwt'],
    ['garbage payload', 'a.%%%.c'],
    ['payload that is not json', `a.${btoa('nope')}.c`],
    ['no exp claim', makeJwt({ sub: 'x' })],
    ['non-numeric exp', makeJwt({ exp: 'soon' })],
    ['empty', ''],
    ['missing', undefined],
  ])('returns null for a %s token', (_name, token) => {
    expect(jwtExpiresAtMs(token as any)).toBeNull();
  });
});

describe('getCallPushFreshness', () => {
  const withExp = (offsetMs: number) => ({
    type: 'call',
    callId: 'c',
    callToken: makeJwt({ exp: (NOW + offsetMs) / 1000 }),
  });

  it('is fresh while the token has time left', () => {
    expect(getCallPushFreshness(withExp(30_000), NOW)).toEqual({
      fresh: true,
      expiresAt: NOW + 30_000,
    });
  });

  it('is expired once the token has passed', () => {
    expect(getCallPushFreshness(withExp(-1_000), NOW).fresh).toBe(false);
  });

  it('is expired with under 3 s left, fresh at exactly 3 s', () => {
    expect(getCallPushFreshness(withExp(CALL_TOKEN_MIN_REMAINING_MS - 1000), NOW).fresh).toBe(false);
    expect(getCallPushFreshness(withExp(CALL_TOKEN_MIN_REMAINING_MS), NOW).fresh).toBe(true);
  });

  it('cannot prove a push stale without a readable exp, so it counts as fresh', () => {
    for (const callToken of ['not-a-jwt', makeJwt({ sub: 'x' }), '', undefined]) {
      expect(getCallPushFreshness({ type: 'call', callId: 'c', callToken }, NOW)).toEqual({
        fresh: true,
        expiresAt: null,
      });
    }
  });
});
