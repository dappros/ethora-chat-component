import http from '../apiClient';
import { store } from '../../roomStore';
import { setXmppPassword } from '../../roomStore/chatSettingsSlice';

/**
 * POST /v1/users/xmpp-token: a fresh short-lived XMPP credential for the
 * logged-in user. It is the same value login and `users/me` put in
 * `user.xmppPassword` (the SASL password, a JWT), minted on demand, and the
 * endpoint exists for exactly one caller: a client reconnecting after the
 * credential it connected with has expired.
 *
 * Until now the SDK never called it. After a SASL `not-authorized` the
 * credentials provider re-read `user.xmppPassword` from the store, which is
 * the very value that just failed, or depended on the whole REST session
 * being rotated first (only when `refreshTokens` is enabled). Hosts without
 * it, and any rotation that came back without an xmppPassword, reconnected
 * with the expired credential until the page was reloaded.
 *
 * Single-flight: several reconnect paths (error handler, watchdog, tab
 * visibility) can ask at once and they should share one request.
 */
let inFlight: Promise<string | null> | null = null;

export function fetchFreshXmppPassword(): Promise<string | null> {
  if (inFlight) return inFlight;

  const request = (async () => {
    try {
      const token = store.getState().chatSettingStore.user?.token || '';
      if (!token) return null;

      const response = await http.post<{
        success?: boolean;
        xmppPassword?: string;
      }>(
        '/v1/users/xmpp-token',
        {},
        { headers: { Authorization: token } }
      );

      const fresh = response?.data?.xmppPassword;
      if (!fresh) return null;

      // Keep the store (and the persisted session) in step, so the next
      // reader, a full reconnect or another tab, starts from the working
      // credential instead of the expired one.
      store.dispatch(setXmppPassword(fresh));
      return fresh;
    } catch {
      // Never throws: the caller falls back to whatever it had, and a
      // failure here must not turn a recoverable blip into a dead session.
      return null;
    }
  })();

  // Cleared from OUTSIDE the async body, on purpose. A `finally` inside it
  // runs synchronously on an early return (no session token yet), i.e.
  // BEFORE `inFlight` below has been assigned, so the flag was set to an
  // already-settled promise and never cleared: every later call, including
  // ones made after login, got that stale null back.
  inFlight = request.finally(() => {
    if (inFlight === tracked) inFlight = null;
  });
  const tracked = inFlight;
  return tracked;
}
