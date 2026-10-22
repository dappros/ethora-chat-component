/**
 * Posts a message to the push service worker. Uses the controlling worker when
 * the page has one, otherwise waits (briefly) for the registration to become
 * active, the same way requestPendingPushClick does for a freshly loaded page.
 */
export async function postToPushServiceWorker(
  message: Record<string, unknown>,
  readyTimeoutMs = 3000
): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  const container = navigator.serviceWorker;
  try {
    let target: ServiceWorker | null | undefined = container.controller;
    if (!target && container.ready) {
      const registration = await Promise.race([
        container.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), readyTimeoutMs)),
      ]);
      target = registration?.active;
    }
    if (!target) return false;
    target.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

// The user token the page mirrors for the worker (see callAuthMirror.ts). Keep
// the cache name and key in step with firebase-messaging-sw.js.
export const CALL_AUTH_CACHE = 'ethora-push-auth-v1';

export const callAuthKey = (): string =>
  `${window.location.origin}/__ethora_call_auth__`;

export async function deleteMirroredCallAuth(): Promise<void> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CALL_AUTH_CACHE);
    await cache.delete(callAuthKey());
  } catch {
    // Cache Storage unavailable: nothing was mirrored.
  }
}

// The worker keeps a click it could not hand to a page (a cold-start tap or
// Answer) in Cache Storage. Keep the names in step with firebase-messaging-sw.js.
export const PENDING_CLICK_CACHE = 'ethora-push-pending-v1';

export const pendingClickKey = (): string =>
  `${window.location.origin}/__ethora_pending_push_click__`;

/** Drops a tap the worker was holding for the next page load (logout). */
export async function deletePendingPushClick(): Promise<void> {
  if (typeof window === 'undefined' || typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(PENDING_CLICK_CACHE);
    await cache.delete(pendingClickKey());
  } catch {
    // Cache Storage unavailable: nothing was kept.
  }
}

/**
 * Tells the worker whether this page can take an incoming call over (the call
 * push listener is mounted with videoCalls enabled). The worker uses it to pick
 * where an Answer or a tap on the call notification goes.
 */
export function announceCallClient(ready: boolean): void {
  void postToPushServiceWorker({ type: 'CALL_CLIENT_READY', ready });
}
