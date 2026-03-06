/* ============================================================
 * Unified Service Worker
 * Handles BOTH Firebase Cloud Messaging (FCM) background pushes
 * AND generic Web Push API events, so all push notifications
 * are captured regardless of origin.
 * ============================================================ */

// ── Firebase SDK ──────────────────────────────────────────────
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAdX24nGQ9nQ0IEzVehIk06uxIb-8HeS04",
  authDomain: "ethora-668e9.firebaseapp.com",
  projectId: "ethora-668e9",
  storageBucket: "ethora-668e9.appspot.com",
  messagingSenderId: "972933470054",
  appId: "1:972933470054:web:d4682e76ef02fd9b9cdaa7"
});

const messaging = firebase.messaging();
const APP_URL = self.location.origin;

// ── Deduplication ─────────────────────────────────────────────
// Track message IDs handled by FCM so the generic `push` listener
// can skip them and avoid duplicate notifications.
const _handledByFcm = new Set();
const DEDUP_TTL_MS = 60_000; // auto-cleanup after 60 s

function markHandledByFcm(id) {
  if (!id) return;
  _handledByFcm.add(id);
  console.log('[SW] FCM message marked as handled:', id);
  setTimeout(() => _handledByFcm.delete(id), DEDUP_TTL_MS);
}

function wasHandledByFcm(id) {
  return id ? _handledByFcm.has(id) : false;
}

// ── Shared Helpers ────────────────────────────────────────────
function isSystemPayload(data) {
  return !data?.msgID && !data?.jid && !!data?.userJid;
}

function buildTargetUrl(data, notification, fallbackUrl) {
  if (fallbackUrl && String(fallbackUrl).startsWith('http')) return fallbackUrl;

  const title = notification?.title || data?.title || '';
  if (title.startsWith('http')) return title;

  if (isSystemPayload(data)) return APP_URL;
  if (!data?.jid) return APP_URL;
  const chatId = String(data.jid).split('@')[0];
  return `${APP_URL}/chat?chatId=${encodeURIComponent(chatId)}`;
}

function postBridgeToClients(windowClients, bridgePayload) {
  windowClients.forEach((client) => {
    client.postMessage({
      type: 'PUSH_FOREGROUND_BRIDGE',
      payload: bridgePayload,
    });
  });
}

function isAnyClientVisible(windowClients) {
  return windowClients.some((c) => c.visibilityState === 'visible');
}

// ── 1. FCM Background Messages ───────────────────────────────
// This fires for pushes delivered through Firebase Cloud Messaging
// when no foreground tab is handling them via onMessage().
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] FCM onBackgroundMessage received', payload);

  const data = payload.data || {};
  const notification = payload.notification || {};
  const messageId = payload.messageId || data.msgID || null;

  // Mark so the generic push handler skips this one
  markHandledByFcm(messageId);

  const isSystem = isSystemPayload(data);
  const title =
    (isSystem ? 'System' : undefined) ||
    notification.title ||
    data.title ||
    'New Message';
  const body =
    notification.body || data.body || 'You have a new message.';
  const url = buildTargetUrl(data, notification, data.url);

  const bridgePayload = {
    messageId,
    notification: { title, body, image: notification.image || '/favicon.ico' },
    data: {
      ...data,
      jid: data.jid || '',
      userJid: data.userJid || '',
      msgID: data.msgID || '',
      workspaceId: data.workspaceId || data.workspace_id || '',
    },
  };

  const options = {
    body,
    icon: notification.image || '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'ethora-notification',
    data: {
      url,
      roomJid: data.jid || null,
      senderId: data.userJid || null,
      messageId,
      workspaceId: data.workspaceId || data.workspace_id || null,
    },
    requireInteraction: false,
    silent: false,
  };

  return clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windowClients) => {
      postBridgeToClients(windowClients, bridgePayload);

      if (!isAnyClientVisible(windowClients)) {
        console.log(
          `[NotifyPolicy] source=fcm_bg action=show reason=${isSystem ? 'system' : 'background'} msgId=${messageId || ''}`
        );
        return self.registration.showNotification(title, options);
      } else {
        console.log(
          `[NotifyPolicy] source=fcm_bg action=skip reason=tab_visible msgId=${messageId || ''}`
        );
      }
    });
});

// ── 2. Generic Web Push API ───────────────────────────────────
// This fires for ANY push delivered via the Web Push protocol,
// including direct backend pushes for XMPP messages that are
// NOT routed through FCM.
self.addEventListener('push', (event) => {
  console.log('[SW] Generic push event received');

  let raw = {};
  try {
    if (event.data) {
      raw = event.data.json();
    }
  } catch (err) {
    console.warn('[SW] Failed to parse push payload as JSON:', err);
    raw = { title: 'New message', body: event.data ? event.data.text() : '' };
  }

  const notification = raw.notification || {};
  const payloadData = raw.data || {};
  const messageId = raw.messageId || payloadData.msgID || null;

  // Skip if FCM already handled this exact message
  if (wasHandledByFcm(messageId)) {
    console.log(`[SW] push event skipped – already handled by FCM (msgId=${messageId})`);
    return;
  }

  const isSystem = isSystemPayload(payloadData);
  const title =
    (isSystem ? 'System' : undefined) ||
    notification.title ||
    raw.title ||
    'Ethora Chat';
  const body =
    notification.body ||
    raw.body ||
    raw.message ||
    payloadData.body ||
    'You have a new message.';
  const url = buildTargetUrl(
    payloadData,
    notification,
    raw.url || raw.clickAction
  );

  const bridgePayload = {
    messageId,
    notification: {
      title,
      body,
      image: raw.icon || '/favicon.ico',
    },
    data: {
      ...payloadData,
      jid: raw.roomJid || payloadData.jid || '',
      userJid: raw.senderId || payloadData.userJid || '',
      msgID: messageId || '',
      workspaceId: raw.workspaceId || payloadData.workspaceId || payloadData.workspace_id || '',
    },
  };

  const options = {
    body,
    icon: raw.icon || '/favicon.ico',
    badge: raw.badge || '/favicon.ico',
    tag: raw.tag || 'ethora-notification',
    data: {
      url,
      roomJid: raw.roomJid || payloadData.jid || null,
      senderId: raw.senderId || payloadData.userJid || null,
      messageId,
      workspaceId: raw.workspaceId || payloadData.workspaceId || payloadData.workspace_id || null,
    },
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        postBridgeToClients(windowClients, bridgePayload);

        if (!isAnyClientVisible(windowClients)) {
          console.log(
            `[NotifyPolicy] source=push_bg action=show reason=${isSystem ? 'system' : 'background'} msgId=${messageId || ''}`
          );
          return self.registration.showNotification(title, options);
        } else {
          console.log(
            `[NotifyPolicy] source=push_bg action=skip reason=tab_visible msgId=${messageId || ''}`
          );
        }
      })
  );
});

// ── 3. Notification Click ─────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  console.log('[NotifyPolicy] source=push_bg action=click_start');
  event.notification.close();

  const targetUrl =
    (event.notification.data && event.notification.data.url) || APP_URL;
  console.log('[NotifyPolicy] source=push_bg action=click_url', {
    url: targetUrl,
  });

  async function handleClick() {
    try {
      const windowClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      console.log('[NotifyPolicy] source=push_bg action=clients_found', {
        count: windowClients.length,
      });

      // 1. Try to find an exactly matching URL
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          console.log('[NotifyPolicy] source=push_bg action=focus_exact', {
            url: client.url,
          });
          return client.focus();
        }
      }

      // 2. Try to find any client on our origin, focus it, and navigate
      for (const client of windowClients) {
        try {
          const clientOrigin = new URL(client.url).origin;
          const swOrigin = self.location.origin;
          if (clientOrigin === swOrigin && 'focus' in client) {
            console.log(
              '[NotifyPolicy] source=push_bg action=focus_and_navigate',
              { from: client.url, to: targetUrl }
            );
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
        console.log('[NotifyPolicy] source=push_bg action=open_new_window', {
          url: targetUrl,
        });
        return clients.openWindow(targetUrl);
      }
    } catch (err) {
      console.error('[NotifyPolicy] source=push_bg action=click_error', err);
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }
  }

  event.waitUntil(handleClick());
});

// ── 4. Push Subscription Change ───────────────────────────────
// Fired when the browser automatically re-creates a subscription
// (e.g. after expiry). Notify clients so they can re-register.
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed – re-subscribing');

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true })
      .then((subscription) => {
        console.log(
          '[SW] New subscription obtained:',
          subscription.endpoint
        );
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
        console.error('[SW] pushsubscriptionchange – failed to re-subscribe:', err);
      })
  );
});

// ── 5. Lifecycle ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated');
  event.waitUntil(clients.claim());
});

self.addEventListener('install', () => {
  console.log('[SW] Service worker installed');
  self.skipWaiting();
});
