import http from '../networking/apiClient';
import {
  CALL_AUTH_CACHE,
  callAuthKey,
  deleteMirroredCallAuth,
} from './pushServiceWorkerBridge';

// The service worker declines a call from the notification when no page is
// open. That needs the user's API token, which the worker cannot reach on its
// own. The SDK already keeps the session (token included) in this origin's
// localStorage, so mirroring `{apiBaseUrl, token}` into Cache Storage, readable
// only from this origin, adds no new exposure. The page writes it straight into
// the cache (no dependency on the worker being awake), refreshes it whenever the
// token changes, and deletes it on logout (useLogout -> disablePushNotifications,
// and the hook when the token goes away).

let lastMirrored: string | null = null;

export async function mirrorCallAuthToWorker(
  token: string | null | undefined
): Promise<void> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return;
  const apiBaseUrl = String(http.defaults.baseURL || '').trim();
  const snapshot = token && apiBaseUrl ? JSON.stringify({ apiBaseUrl, token }) : '';
  if (snapshot === lastMirrored) return;
  lastMirrored = snapshot;
  if (!snapshot) {
    await deleteMirroredCallAuth();
    return;
  }
  try {
    const cache = await caches.open(CALL_AUTH_CACHE);
    await cache.put(
      callAuthKey(),
      new Response(snapshot, { headers: { 'Content-Type': 'application/json' } })
    );
  } catch {
    // Cache Storage unavailable: a worker-side decline just closes the
    // notification and the caller times out.
  }
}
