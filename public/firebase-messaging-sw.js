/* eslint-disable no-empty */
/* eslint-env worker */
/* global firebase, clients, importScripts */

importScripts(
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js'
);
importScripts(
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js'
);

// ── DEBUG ─────────────────────────────────────────────────────
const DEBUG = false;
const DEDUP_TTL = 60 * 1000;

const params = new URL(self.location.href).searchParams;
const CUSTOM_ICON = (params.get('iconPath') || '').trim();
const CUSTOM_BADGE = (params.get('badgePath') || '').trim();
const DEFAULT_ICON = CUSTOM_ICON || '/favicon.ico';
const DEFAULT_BADGE = CUSTOM_BADGE || CUSTOM_ICON || '/favicon.ico';

// ── LOGGING ───────────────────────────────────────────────────
function log(...args) {
  if (DEBUG) console.log('[SW]', ...args);
}

function warn(...args) {
  if (DEBUG) console.warn('[SW]', ...args);
}

function error(...args) {
  console.error('[SW]', ...args);
}

// ── CONFIG ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

const APP_URL = self.location.origin;

// ── INIT FIREBASE ─────────────────────────────────────────────
try {
  if (
    firebaseConfig.apiKey &&
    firebaseConfig.appId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.projectId
  ) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      log('Firebase initialized');
    } else {
      log('Firebase already initialized');
    }

    firebase.messaging();
    log('Firebase messaging ready (without onBackgroundMessage)');
  } else {
    warn('Firebase config missing', firebaseConfig);
  }
} catch (e) {
  error('Firebase init error', e);
}

// ── DEDUP ─────────────────────────────────────────────────────
const handledPushes = new Map();

function cleanupHandledPushes() {
  const now = Date.now();

  for (const [key, ts] of handledPushes.entries()) {
    if (now - ts > DEDUP_TTL) {
      handledPushes.delete(key);
    }
  }
}

function rememberPush(key) {
  if (!key) return;
  cleanupHandledPushes();
  handledPushes.set(key, Date.now());
  log('DEDUP remember:', key);
}

function wasHandled(key) {
  if (!key) return false;
  cleanupHandledPushes();

  const hit = handledPushes.has(key);
  if (hit) log('DEDUP hit:', key);

  return hit;
}

// ── HELPERS ───────────────────────────────────────────────────
function isVisibleClients(clientsList) {
  return clientsList.some((c) => {
    try {
      return c.visibilityState === 'visible';
    } catch {
      return false;
    }
  });
}

function dumpClients(clientsList) {
  return clientsList.map((c) => ({
    url: c.url,
    visibility: c.visibilityState,
  }));
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stableStringify(value) {
  try {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'object') return String(value);

    if (Array.isArray(value)) {
      return `[${value.map((v) => stableStringify(v)).join(',')}]`;
    }

    const keys = Object.keys(value).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
      .join(',')}}`;
  } catch {
    return '';
  }
}

function simpleHash(input) {
  const str = String(input || '');
  let hash = 0;

  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  return String(hash);
}

function normalizeUrl(url) {
  if (!url) return APP_URL;

  try {
    return new URL(url, self.location.origin).toString();
  } catch {
    return APP_URL;
  }
}

function pickTitle(raw = {}, data = {}, notification = {}) {
  return notification.title || raw.title || data.title || 'New Message';
}

function pickBody(raw = {}, data = {}, notification = {}) {
  return notification.body || raw.body || data.body || 'You have a new message';
}

function pickUrl(raw = {}, data = {}, notification = {}) {
  return normalizeUrl(
    data.url ||
      data.link ||
      data.click_action ||
      notification.click_action ||
      raw.url ||
      raw.link ||
      raw.click_action ||
      APP_URL
  );
}

function pickIcon(raw = {}, data = {}, notification = {}) {
  return data.icon || notification.icon || raw.icon || DEFAULT_ICON;
}

function pickBadge(raw = {}, data = {}, notification = {}) {
  return data.badge || notification.badge || raw.badge || DEFAULT_BADGE;
}

function pickImage(raw = {}, data = {}, notification = {}) {
  return data.image || notification.image || raw.image || undefined;
}

function extractMessageId(raw = {}, data = {}) {
  return (
    raw.messageId ||
    raw.fcmMessageId ||
    raw.fcmMessageId ||
    raw.message_id ||
    data.messageId ||
    data.fcmMessageId ||
    data.message_id ||
    data.msgID ||
    data['gcm.message_id'] ||
    data['google.message_id'] ||
    data['google.c.a.c_id'] ||
    null
  );
}

function hasNotificationPayload(raw = {}, notification = {}) {
  return Boolean(
    (notification && (notification.title || notification.body)) ||
      (raw.notification && (raw.notification.title || raw.notification.body))
  );
}

function makeDedupKey(raw = {}, data = {}, notification = {}) {
  const messageId = extractMessageId(raw, data);
  if (messageId) return `id:${messageId}`;

  const title = pickTitle(raw, data, notification);
  const body = pickBody(raw, data, notification);
  const url = pickUrl(raw, data, notification);

  const canonical = stableStringify({
    title,
    body,
    url,
    data,
    notification,
  });

  return `fp:${simpleHash(canonical)}`;
}

function normalizePush(event) {
  if (!event.data) {
    warn('EMPTY PUSH');
    return { type: 'empty', raw: {}, text: '' };
  }

  let text = '';

  try {
    text = event.data.text();
    log('PUSH TEXT', text);
  } catch (e) {
    warn('TEXT READ FAIL', e);
  }

  const json = safeJsonParse(text);

  if (json) {
    log('PUSH JSON', json);
    return { type: 'json', raw: json, text };
  }

  warn('NOT JSON PUSH', text);

  return {
    type: 'text',
    raw: {
      title: 'New Message',
      body: text,
      data: {},
    },
    text,
  };
}

async function broadcastDebugMessage(payload) {
  try {
    const windowClients = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const c of windowClients) {
      try {
        c.postMessage({
          type: 'PUSH_DEBUG',
          payload,
        });
      } catch {}
    }
  } catch (e) {
    warn('broadcastDebugMessage failed', e);
  }
}

// ── MAIN HANDLER ──────────────────────────────────────────────
async function handlePush(raw = {}, source = 'push') {
  const data = raw.data || {};
  const notification = raw.notification || {};

  const title = pickTitle(raw, data, notification);
  const body = pickBody(raw, data, notification);
  const url = pickUrl(raw, data, notification);
  const icon = pickIcon(raw, data, notification);
  const badge = pickBadge(raw, data, notification);
  const image = pickImage(raw, data, notification);

  const messageId = extractMessageId(raw, data);
  const dedupKey = makeDedupKey(raw, data, notification);
  const browserWillAutoShow = hasNotificationPayload(raw, notification);

  log('--- PUSH DECISION ---');
  log('source:', source);
  log('messageId:', messageId);
  log('dedupKey:', dedupKey);
  log('title:', title);
  log('body:', body);
  log('url:', url);
  log('icon:', icon);
  log('badge:', badge);
  log('browserWillAutoShow:', browserWillAutoShow);

  if (wasHandled(dedupKey)) {
    log('SKIP DEDUP');
    return;
  }

  rememberPush(dedupKey);

  const windowClients = await clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  const visible = isVisibleClients(windowClients);

  log('clients:', dumpClients(windowClients));
  log('visibleClientExists:', visible);

  await broadcastDebugMessage({
    source,
    raw,
    data,
    notification,
    title,
    body,
    url,
    icon,
    badge,
    image,
    messageId,
    dedupKey,
    browserWillAutoShow,
  });

  if (browserWillAutoShow) {
    log('SKIP MANUAL SHOW: browser/FCM should auto-display notification');
    return;
  }

  // Data-only push: показуємо вручну
  const options = {
    body,
    icon,
    badge,
    image,
    tag: dedupKey,
    renotify: false,
    data: {
      url,
      messageId,
      dedupKey,
      source,
    },
  };

  if (!visible) {
    log('SHOW NOTIFICATION', {
      reason: 'NO_VISIBLE_CLIENT',
      tag: options.tag,
    });

    return self.registration.showNotification(title, options);
  }

  log('SKIP NOTIFICATION', {
    reason: 'VISIBLE_CLIENT',
  });
}

// ── RAW PUSH ONLY ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  log('RAW PUSH EVENT');

  event.waitUntil(
    (async () => {
      try {
        const { type, raw } = normalizePush(event);

        log('PARSED PUSH', {
          type,
          raw,
          messageId: extractMessageId(raw, raw.data || {}),
        });

        return handlePush(raw, `raw_push_${type}`);
      } catch (e) {
        error('PUSH HANDLER ERROR', e);
      }
    })()
  );
});

// ── CLICK ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  log('NOTIFICATION CLICK', event.notification);

  event.notification.close();

  const url = event.notification?.data?.url || APP_URL;

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        try {
          if ('focus' in client) {
            await client.focus();

            try {
              client.postMessage({
                type: 'OPEN_FROM_PUSH',
                url,
                notificationData: event.notification?.data || {},
              });
            } catch {}

            return;
          }
        } catch {}
      }

      return clients.openWindow(url);
    })()
  );
});

// ── LIFECYCLE ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  log('SW INSTALLED');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  log('SW ACTIVATED');
  event.waitUntil(clients.claim());
});
