import { describe, expect, it } from 'vitest';
import { isStatusConnectionLost } from './useChatWrapperInit';

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
