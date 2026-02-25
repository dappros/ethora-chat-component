/* ============================================================
 * Ethora Chat – Service Worker
 * Handles Web Push events so notifications arrive even when
 * the browser tab is closed or the app is in the background.
 * ============================================================ */

const APP_URL = self.location.origin;

// ── Push Event ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[SW][WebPush] Push event received');

  let data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (err) {
    console.warn('[SW][WebPush] Failed to parse push payload as JSON:', err);
    data = { title: 'New message', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Ethora Chat';
  const options = {
    body: data.body || data.message || 'You have a new message.',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'ethora-notification',
    data: {
      url: data.url || data.clickAction || APP_URL,
      roomJid: data.roomJid || null,
      senderId: data.senderId || null,
    },
    requireInteraction: false,
    silent: false,
  };

  console.log('[SW][WebPush] Showing notification:', { title, options });

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification Click ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  console.log('[SW][WebPush] Notification clicked:', event.notification);

  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || APP_URL;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Try to focus an existing tab that already has the app open
        for (const client of windowClients) {
          const clientUrl = new URL(client.url);
          const targetUrlObj = new URL(targetUrl);

          if (clientUrl.origin === targetUrlObj.origin && 'focus' in client) {
            console.log('[SW][WebPush] Focusing existing tab');
            return client.focus().then((focusedClient) => {
              // Navigate within the focused client if needed
              if (focusedClient && targetUrl !== focusedClient.url) {
                return focusedClient.navigate(targetUrl);
              }
              return focusedClient;
            });
          }
        }

        // No existing tab found – open a new one
        console.log('[SW][WebPush] Opening new tab:', targetUrl);
        return clients.openWindow(targetUrl);
      })
  );
});

// ── Push Subscription Change ──────────────────────────────────
// Fired when the browser automatically re-creates a subscription
// (e.g. after expiry). The app should re-register it with the backend.
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW][WebPush] Push subscription changed – re-subscribing');

  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        // applicationServerKey will be provided if previously set;
        // the browser retains it across subscription renewals.
      })
      .then((subscription) => {
        console.log('[SW][WebPush] New subscription obtained:', subscription.endpoint);
        // Notify all controlled clients so they can re-register with the backend
        return clients.matchAll().then((allClients) => {
          allClients.forEach((client) => {
            client.postMessage({
              type: 'PUSH_SUBSCRIPTION_CHANGED',
              subscription: subscription.toJSON(),
            });
          });
        });
      })
      .catch((err) => {
        console.error('[SW][WebPush] pushsubscriptionchange – failed to re-subscribe:', err);
      })
  );
});

// ── Activate ──────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW][WebPush] Service worker activated');
  event.waitUntil(clients.claim());
});

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW][WebPush] Service worker installed');
  self.skipWaiting();
});
