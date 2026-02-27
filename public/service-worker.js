/* ============================================================
 * Ethora Chat – Service Worker
 * Handles Web Push events so notifications arrive even when
 * the browser tab is closed or the app is in the background.
 * ============================================================ */

const APP_URL = self.location.origin;

const isSystemPayload = (data) =>
  !data?.msgID && !data?.jid && !!data?.userJid;

const buildTargetUrl = (data, notification, fallbackUrl) => {
  if (fallbackUrl && String(fallbackUrl).startsWith('http')) return fallbackUrl;

  // Admin push might provide the URL in the title
  const title = notification?.title || data?.title || '';
  if (title.startsWith('http')) return title;

  if (isSystemPayload(data)) return APP_URL;
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
  const bridgePayload = {
    messageId: data.messageId || payloadData?.msgID || null,
    notification: {
      title: notification.title || data.title || 'Ethora Chat',
      body:
        notification.body ||
        data.body ||
        data.message ||
        payloadData?.body ||
        'You have a new message.',
      image: data.icon || '/favicon.ico',
    },
    data: {
      ...payloadData,
      jid: data.roomJid || payloadData?.jid || '',
      userJid: data.senderId || payloadData?.userJid || '',
      msgID: data.messageId || payloadData?.msgID || '',
    },
  };
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
      url: buildTargetUrl(payloadData, notification, data.url || data.clickAction),
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

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        const isAnyTabVisible = windowClients.some(client => client.visibilityState === 'visible');

        windowClients.forEach((client) => {
          client.postMessage({
            type: 'PUSH_FOREGROUND_BRIDGE',
            payload: bridgePayload,
          });
        });

        if (!isAnyTabVisible) {
          console.log(
            `[NotifyPolicy] source=push_bg action=show reason=${isSystem ? 'system' : 'background'} msgId=${options.data.messageId || ''}`
          );
          return self.registration.showNotification(title, options);
        } else {
          console.log(
            `[NotifyPolicy] source=push_bg action=skip reason=tab_visible msgId=${options.data.messageId || ''}`
          );
        }
      })
  );
});

// ── Notification Click ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  console.log('[NotifyPolicy] source=push_bg action=click_start');
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || APP_URL;
  console.log('[NotifyPolicy] source=push_bg action=click_url', { url: targetUrl });

  async function handleClick() {
    try {
      const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      console.log('[NotifyPolicy] source=push_bg action=clients_found', { count: windowClients.length });

      // 1. Try to find an exactly matching URL
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          console.log('[NotifyPolicy] source=push_bg action=focus_exact', { url: client.url });
          return client.focus();
        }
      }

      // 2. Try to find any client on our origin, focus it, and navigate
      for (const client of windowClients) {
        try {
          const clientOrigin = new URL(client.url).origin;
          const swOrigin = self.location.origin;
          if (clientOrigin === swOrigin && 'focus' in client) {
            console.log('[NotifyPolicy] source=push_bg action=focus_and_navigate', { from: client.url, to: targetUrl });
            const focusedClient = await client.focus();
            if (focusedClient && 'navigate' in focusedClient) {
              return focusedClient.navigate(targetUrl);
            }
          }
        } catch (e) {
          // Ignore invalid URLs
        }
      }

      // 3. Fallback: Open a new window
      if (clients.openWindow) {
        console.log('[NotifyPolicy] source=push_bg action=open_new_window', { url: targetUrl });
        return clients.openWindow(targetUrl);
      }
    } catch (err) {
      console.error('[NotifyPolicy] source=push_bg action=click_error', err);
      // Last resort fallback
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }
  }

  event.waitUntil(handleClick());
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
