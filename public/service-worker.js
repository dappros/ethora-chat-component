/* ============================================================
 * Ethora Chat – Service Worker
 * Handles Web Push events so notifications arrive even when
 * the browser tab is closed or the app is in the background.
 * ============================================================ */

const APP_URL = self.location.origin;

const isSystemPayload = (data) =>
  !data?.msgID && !data?.jid && !!data?.userJid;

const buildTargetUrl = (data, fallbackUrl) => {
  if (isSystemPayload(data)) return APP_URL;
  if (fallbackUrl) return fallbackUrl;
  if (!data?.jid) return APP_URL;
  const chatId = String(data.jid).split('@')[0];
  return `${APP_URL}/chat?chatId=${encodeURIComponent(chatId)}`;
};

// ── Push Event ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[NotifyPolicy] source=push_bg action=received');

  let data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (err) {
    console.warn('[SW][WebPush] Failed to parse push payload as JSON:', err);
    data = { title: 'New message', body: event.data ? event.data.text() : '' };
  }

  const notification = data.notification || {};
  const payloadData = data?.data || {};
  const isSystem = isSystemPayload(payloadData);
  const title = (isSystem ? 'System' : undefined) || notification.title || data.title || 'Ethora Chat';
  const options = {
    body:
      notification.body ||
      data.body ||
      data.message ||
      payloadData?.body ||
      'You have a new message.',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'ethora-notification',
    data: {
      url: buildTargetUrl(payloadData, data.url || data.clickAction),
      roomJid: data.roomJid || payloadData?.jid || null,
      senderId: data.senderId || payloadData?.userJid || null,
      messageId: data.messageId || payloadData?.msgID || null,
    },
    requireInteraction: false,
    silent: false,
  };

  console.log(
    `[NotifyPolicy] source=push_bg action=show reason=${isSystem ? 'system' : 'background'} msgId=${options.data.messageId || ''}`
  );

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification Click ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  console.log('[NotifyPolicy] source=push_bg action=click');

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
            console.log('[NotifyPolicy] source=push_bg action=focus_existing');
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
        console.log('[NotifyPolicy] source=push_bg action=open_new', targetUrl);
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
