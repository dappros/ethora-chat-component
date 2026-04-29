/* eslint-disable no-empty */
/* eslint-env worker */
/* global clients */

// ── DEBUG ─────────────────────────────────────────────────────
const DEBUG = false;
const DEDUP_TTL = 60 * 1000;

const params = new URL(self.location.href).searchParams;
const CUSTOM_ICON = (params.get('iconPath') || '').trim();
const CUSTOM_BADGE = (params.get('badgePath') || '').trim();
const DEFAULT_ICON = `${self.location.origin}/favicon-192.png`;
const DEFAULT_BADGE = `${self.location.origin}/favicon-192.png`;

log('SW icon config', {
  customIcon: CUSTOM_ICON || null,
  customBadge: CUSTOM_BADGE || null,
  defaultIcon: DEFAULT_ICON,
  defaultBadge: DEFAULT_BADGE,
});

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

const APP_URL = self.location.origin;

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
  if (!DEBUG) return [];
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

async function checkAssetAvailability(url) {
  if (!DEBUG) return undefined;
  if (!url) return { ok: false, status: null, error: 'empty_url' };

  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return {
      ok: response.ok,
      status: response.status,
      resolvedUrl: response.url || url,
    };
  } catch (e) {
    return {
      ok: false,
      status: null,
      error: String(e?.message || e || 'fetch_failed'),
    };
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

function pickIcon() {
  return CUSTOM_ICON || DEFAULT_ICON;
}

function pickBadge() {
  return CUSTOM_BADGE || DEFAULT_BADGE;
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
  if (!DEBUG) return;
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
  const icon = pickIcon();
  const badge = pickBadge();
  const image = pickImage(raw, data, notification);

  const messageId = extractMessageId(raw, data);
  const dedupKey = makeDedupKey(raw, data, notification);
  const iconAvailability = DEBUG
    ? await checkAssetAvailability(icon)
    : undefined;
  const badgeAvailability = DEBUG
    ? await checkAssetAvailability(badge)
    : undefined;
  const iconDebug = DEBUG
    ? {
        selectedIcon: icon,
        selectedBadge: badge,
        selectedImage: image || null,
        customIcon: CUSTOM_ICON || null,
        customBadge: CUSTOM_BADGE || null,
        defaultIcon: DEFAULT_ICON,
        defaultBadge: DEFAULT_BADGE,
        payloadIcon: data.icon || notification.icon || raw.icon || null,
        payloadBadge: data.badge || notification.badge || raw.badge || null,
        iconAvailability,
        badgeAvailability,
      }
    : undefined;

  log('--- PUSH DECISION ---');
  log('source:', source);
  log('messageId:', messageId);
  log('dedupKey:', dedupKey);
  log('title:', title);
  log('body:', body);
  log('url:', url);
  log('icon:', icon);
  log('badge:', badge);
  if (iconDebug) log('iconDebug:', iconDebug);

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

  if (DEBUG) log('clients:', dumpClients(windowClients));
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
    iconDebug,
    messageId,
    dedupKey,
  });

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
  event.stopImmediatePropagation?.();

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
      const targetUrl = normalizeUrl(url);

      const payload = {
        data: event.notification?.data || {},
        notification: {
          title: event.notification?.title || '',
          body: event.notification?.body || '',
        },
      };

      const preferredClient =
        allClients.find((client) => {
          try {
            return client.url.startsWith(self.location.origin);
          } catch {
            return false;
          }
        }) || allClients[0];

      if (preferredClient) {
        try {
          if ('navigate' in preferredClient) {
            await preferredClient.navigate(targetUrl);
          }

          if ('focus' in preferredClient) {
            await preferredClient.focus();
          }

          try {
            preferredClient.postMessage({
              type: 'PUSH_NOTIFICATION_CLICK',
              ...payload,
            });
          } catch {}

          // Backward compatibility for any legacy listeners in app code
          try {
            preferredClient.postMessage({
              type: 'OPEN_FROM_PUSH',
              url: targetUrl,
              notificationData: event.notification?.data || {},
            });
          } catch {}

          return;
        } catch (e) {
          warn('notificationclick client handling failed', e);
        }
      }

      const opened = await clients.openWindow(targetUrl);

      if (opened) {
        try {
          opened.postMessage({
            type: 'PUSH_NOTIFICATION_CLICK',
            ...payload,
          });
        } catch {}
      }

      return opened;
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
