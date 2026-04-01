// ── Firebase SDK ──────────────────────────────────────────────
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ── Dynamic Configuration ─────────────────────────────────────
const params = new URL(self.location.href).searchParams;

const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

let messaging = null;

if (
  firebaseConfig.apiKey &&
  firebaseConfig.appId &&
  firebaseConfig.messagingSenderId &&
  firebaseConfig.projectId
) {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  messaging = firebase.messaging();
} else {
  console.warn('[SW] Firebase config is missing. FCM background messaging is disabled.');
}

const APP_URL = self.location.origin;

// ── Deduplication ─────────────────────────────────────────────
const _handledByFcm = new Set();
const DEDUP_TTL_MS = 60_000;

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
  const messageId = data.msgID || data.messageId || data.message_id || '';
  const params = new URLSearchParams({ chatId });
  if (messageId) {
    params.set('messageId', String(messageId));
  }
  return `${APP_URL}/chat?${params.toString()}`;
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
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    console.log('[SW] FCM onBackgroundMessage received', payload);

    const data = payload.data || {};
    const notification = payload.notification || {};
    const messageId = payload.messageId || data.msgID || null;

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
      notification: {
        title,
        body,
        image: notification.image || notification.icon || '/favicon.ico',
      },
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
      icon: notification.icon || notification.image || '/favicon.ico',
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
        }

        console.log(
          `[NotifyPolicy] source=fcm_bg action=skip reason=tab_visible msgId=${messageId || ''}`
        );
      });
  });
}

// ── 2. Generic Web Push API ───────────────────────────────────
self.addEventListener('push', (event) => {
  console.log('[SW] Generic push event received');

  let raw = {};

  try {
    if (event.data) {
      raw = event.data.json();
    }
  } catch (err) {
    console.warn('[SW] Failed to parse push payload as JSON:', err);
    raw = {
      title: 'New message',
      body: event.data ? event.data.text() : '',
    };
  }

  const notification = raw.notification || {};
  const payloadData = raw.data || {};
  const messageId = raw.messageId || payloadData.msgID || null;

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
      image: raw.icon || notification.icon || '/favicon.ico',
    },
    data: {
      ...payloadData,
      jid: raw.roomJid || payloadData.jid || '',
      userJid: raw.senderId || payloadData.userJid || '',
      msgID: messageId || '',
      workspaceId:
        raw.workspaceId ||
        payloadData.workspaceId ||
        payloadData.workspace_id ||
        '',
    },
  };

  const options = {
    body,
    icon: raw.icon || notification.icon || '/favicon.ico',
    badge: raw.badge || '/favicon.ico',
    tag: raw.tag || 'ethora-notification',
    data: {
      url,
      roomJid: raw.roomJid || payloadData.jid || null,
      senderId: raw.senderId || payloadData.userJid || null,
      messageId,
      workspaceId:
        raw.workspaceId ||
        payloadData.workspaceId ||
        payloadData.workspace_id ||
        null,
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
        }

        console.log(
          `[NotifyPolicy] source=push_bg action=skip reason=tab_visible msgId=${messageId || ''}`
        );
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

      const clickPayload = {
        type: 'PUSH_NOTIFICATION_CLICK',
        data: event.notification.data || {},
        notification: {
          title: event.notification.title || '',
          body: event.notification.body || '',
        },
      };

      windowClients.forEach((client) => {
        client.postMessage(clickPayload);
      });

      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          console.log('[NotifyPolicy] source=push_bg action=focus_exact', {
            url: client.url,
          });
          return client.focus();
        }
      }

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

            return focusedClient;
          }
        } catch (_) {}
      }

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
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed');
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((allClients) => {
      allClients.forEach((client) => {
        client.postMessage({
          type: 'PUSH_SUBSCRIPTION_CHANGED',
        });
      });
    })
  );
});

// ── 5. Lifecycle ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated');
  event.waitUntil(clients.claim());
});

self.addEventListener('install', (event) => {
  console.log('[SW] Service worker installed');
  event.waitUntil(self.skipWaiting());
});
