import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Bug C regression: an expired hourly xmpp password (or, upstream of it, an
// expired REST access token that the credentials provider re-mints via
// refreshAuthTokensQuietly) used to surface as the SAME "Connection lost.
// Retrying..." banner as a genuine dropped socket - recoverFromAuthFailure's
// bounded, self-healing retry cycles `status` through 'auth_failed' ->
// 'offline' -> 'connecting' exactly like a real outage does. `isRecoveringAuth`
// is the flag that lets a consumer (see useChatWrapperInit's
// isStatusConnectionLost) tell "this is an expected, in-flight credential
// refresh" apart from "the connection is actually gone".
const fakeXmppClient = {
  jid: { toString: () => 'me@example.com/res', domain: 'example.com' },
  setMaxListeners: vi.fn(),
  reconnect: { stop: vi.fn() },
  on: vi.fn(),
  once: vi.fn(),
  removeAllListeners: vi.fn(),
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(() => Promise.resolve()),
};

vi.mock('@xmpp/client', () => ({
  default: { client: vi.fn(() => fakeXmppClient) },
  xml: (...args: any[]) => ({ args }),
}));

import { XmppClient } from './xmppClient';

describe('XmppClient.isRecoveringAuth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is true for the whole span of a bounded, provider-backed recovery attempt and false once it settles', async () => {
    const client = new XmppClient('user', 'pass') as any;
    client.setCredentialsProvider(async () => ({
      username: 'user',
      password: 'freshly-minted-password',
    }));

    expect(client.isRecoveringAuth).toBe(false);

    const recoveryPromise: Promise<boolean> = client.recoverFromAuthFailure('test');

    // Must already be set before the first await inside recoverFromAuthFailure
    // resolves - a poller reading `status` in the same tick must never see
    // 'auth_failed' without also seeing recovery in flight.
    expect(client.isRecoveringAuth).toBe(true);

    // disconnect() (called from reconnect()) falls back to a 2s timer when
    // the mocked client never actually emits 'disconnect'/'offline'.
    await vi.advanceTimersByTimeAsync(2100);
    const recovered = await recoveryPromise;

    expect(recovered).toBe(true);
    expect(client.isRecoveringAuth).toBe(false);
  });

  it('never raises the flag once recovery attempts are exhausted - a genuinely dead credential must still read as connection-lost', async () => {
    const client = new XmppClient('user', 'pass') as any;
    client.setCredentialsProvider(async () => ({
      username: 'user',
      password: 'freshly-minted-password',
    }));
    client.authRecoveryAttempts = client.maxAuthRecoveryAttempts;

    const recovered = await client.recoverFromAuthFailure('test');

    expect(recovered).toBe(false);
    expect(client.isRecoveringAuth).toBe(false);
  });

  it('never raises the flag when no credentials provider is configured', async () => {
    const client = new XmppClient('user', 'pass') as any;

    const recovered = await client.recoverFromAuthFailure('test');

    expect(recovered).toBe(false);
    expect(client.isRecoveringAuth).toBe(false);
  });

  it('clears the flag when the credential refresh itself throws', async () => {
    const client = new XmppClient('user', 'pass') as any;
    client.setCredentialsProvider(async () => {
      throw new Error('host refresh endpoint down');
    });

    const recovered = await client.recoverFromAuthFailure('test');

    expect(recovered).toBe(false);
    expect(client.isRecoveringAuth).toBe(false);
  });
});
