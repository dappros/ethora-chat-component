import { describe, expect, it } from 'vitest';
import { isStatusConnectionLost, hasHostRefreshedSession } from './useChatWrapperInit';

// Regression: isConnectionLost (which drives ConnectionBanner via
// ChatWrapper) used to be set only inside the initial-connect try/catch in
// useChatWrapperInit and never touched again. XmppClient.status is a plain
// mutable property flipped by scheduleReconnect, the SASL not-authorized
// recovery path, and the browser online/offline listeners in
// xmppClient.ts - none of those trigger a React re-render, so a session
// that connected once and later dropped (wifi blip, laptop sleep, a
// mid-session credential refresh) never showed the banner again. A polling
// effect now re-derives isConnectionLost from client.status via this
// predicate; this test locks down the status -> banner mapping itself.
describe('isStatusConnectionLost', () => {
  it('treats connecting, offline, error and auth_failed as connection lost', () => {
    expect(isStatusConnectionLost('connecting')).toBe(true);
    expect(isStatusConnectionLost('offline')).toBe(true);
    expect(isStatusConnectionLost('error')).toBe(true);
    expect(isStatusConnectionLost('auth_failed')).toBe(true);
  });

  it('treats online as connected', () => {
    expect(isStatusConnectionLost('online')).toBe(false);
  });

  it('treats an unknown/missing status as not connection-lost (no client yet)', () => {
    expect(isStatusConnectionLost(undefined)).toBe(false);
    expect(isStatusConnectionLost(null)).toBe(false);
    expect(isStatusConnectionLost('')).toBe(false);
  });
});

// Bug C: an expired token (REST access token or the hourly xmpp password)
// recovers on its own via XmppClient's bounded credential-refresh cycle,
// which cycles `status` through the exact same values a real outage does.
// Surfacing that as "Connection lost. Retrying..." makes an expected,
// self-healing refresh look like a scary error. `isRecoveringAuth` (mirrored
// from XmppClient.isRecoveringAuth) is how a caller says "this transition is
// part of an in-flight, bounded auth recovery, not a real drop".
describe('isStatusConnectionLost with isRecoveringAuth', () => {
  it('suppresses the banner for every status while an auth recovery is in flight', () => {
    expect(isStatusConnectionLost('auth_failed', true)).toBe(false);
    expect(isStatusConnectionLost('offline', true)).toBe(false);
    expect(isStatusConnectionLost('connecting', true)).toBe(false);
    expect(isStatusConnectionLost('error', true)).toBe(false);
  });

  it('still reports online as connected while recovering (no-op safety net)', () => {
    expect(isStatusConnectionLost('online', true)).toBe(false);
  });

  it('falls back to the plain status mapping once recovery is not in flight', () => {
    expect(isStatusConnectionLost('auth_failed', false)).toBe(true);
    expect(isStatusConnectionLost('offline', false)).toBe(true);
    expect(isStatusConnectionLost('online', false)).toBe(false);
  });

  it('defaults to the plain status mapping when the flag is omitted (back-compat)', () => {
    expect(isStatusConnectionLost('auth_failed')).toBe(true);
    expect(isStatusConnectionLost('online')).toBe(false);
  });
});

// Bug C, part 2: measured live (200ms DOM poll for "Connection lost" text)
// that a COLD start - a session that has never once reached 'online' -
// flashed the banner for ~2s on every load: the very first WS handshake +
// SASL bind routinely sits in 'connecting'/'offline' for a second or two,
// and the plain status mapping above painted that identically to a real
// drop. `hasEverBeenOnline` (mirrored from XmppClient.hasEverBeenOnline) is
// the one-way latch that tells the two apart: false until the client's
// first 'online', then true for the rest of the session no matter what
// happens next - so a genuine later drop still shows the banner.
describe('isStatusConnectionLost with hasEverBeenOnline', () => {
  it('never-online: suppresses the banner for every status before the first "online"', () => {
    expect(isStatusConnectionLost('connecting', false, false)).toBe(false);
    expect(isStatusConnectionLost('offline', false, false)).toBe(false);
    expect(isStatusConnectionLost('error', false, false)).toBe(false);
    expect(isStatusConnectionLost('auth_failed', false, false)).toBe(false);
  });

  it('online -> offline: a session that HAS been online and then drops still shows the banner', () => {
    expect(isStatusConnectionLost('offline', false, true)).toBe(true);
    expect(isStatusConnectionLost('error', false, true)).toBe(true);
    expect(isStatusConnectionLost('connecting', false, true)).toBe(true);
  });

  it('recovery-in-flight still wins even once the session has been online before', () => {
    expect(isStatusConnectionLost('auth_failed', true, true)).toBe(false);
    expect(isStatusConnectionLost('offline', true, true)).toBe(false);
  });

  it('never-online AND recovering is still suppressed (belt and braces)', () => {
    expect(isStatusConnectionLost('auth_failed', true, false)).toBe(false);
  });

  it('online status is never "lost" regardless of hasEverBeenOnline', () => {
    expect(isStatusConnectionLost('online', false, false)).toBe(false);
    expect(isStatusConnectionLost('online', false, true)).toBe(false);
  });

  it('defaults hasEverBeenOnline to true when omitted (back-compat with the plain mapping)', () => {
    expect(isStatusConnectionLost('offline')).toBe(true);
    expect(isStatusConnectionLost('offline', false)).toBe(true);
  });
});

// Bug D: a FAILED initBeforeLoad provider bootstrap used to lock the chat
// area on "Connecting..." forever, re-checking the same stale
// providerBootstrapStatus every 2s - even after a host configured with
// config.customLogin / config.jwtLogin had already recovered the session
// (LoginWrapper dispatches that independently of the provider bootstrap).
// hasHostRefreshedSession is the check that lets the init effect fall
// through to a direct connect instead of stalling on a bootstrap attempt
// that is no longer relevant.
describe('hasHostRefreshedSession', () => {
  it('is true once both xmpp credentials are present, however they got there', () => {
    expect(
      hasHostRefreshedSession({ xmppUsername: 'u1', xmppPassword: 'p1' })
    ).toBe(true);
  });

  it('is false while the password is still missing (provider bootstrap genuinely has nothing yet)', () => {
    expect(
      hasHostRefreshedSession({ xmppUsername: 'u1', xmppPassword: '' })
    ).toBe(false);
  });

  it('is false while the username is still missing', () => {
    expect(
      hasHostRefreshedSession({ xmppUsername: '', xmppPassword: 'p1' })
    ).toBe(false);
  });

  it('is false for a completely empty user', () => {
    expect(hasHostRefreshedSession({})).toBe(false);
  });
});
