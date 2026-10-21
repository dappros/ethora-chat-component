/* eslint-disable no-empty */
/* eslint-env worker */
/* global clients */

// ── DEBUG ─────────────────────────────────────────────────────
const DEBUG = false;
const DEDUP_TTL = 60 * 1000;

const params = new URL(self.location.href).searchParams;
const CUSTOM_ICON = (params.get('iconPath') || '').trim();
const CUSTOM_BADGE = (params.get('badgePath') || '').trim();
const CUSTOM_CLICK_PATH = (params.get('clickPath') || '').trim();
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

// Where a tap that has to open a window lands. The host can name the page
// that mounts the chat (iconPath-style, via the registration url); only a
// same-origin path is accepted, anything else falls back to the origin root.
function sanitizeClickPath(value) {
  const path = typeof value === 'string' ? value.trim() : '';
  if (!path || path.charAt(0) !== '/') return '';
  try {
    const resolved = new URL(path, self.location.origin);
    if (resolved.origin !== self.location.origin) return '';
    return `${resolved.pathname}${resolved.search}`;
  } catch {
    return '';
  }
}

const CLICK_URL = `${APP_URL}${sanitizeClickPath(CUSTOM_CLICK_PATH) || '/'}`;

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

// `<appId>_<userId>` (24-hex ids, or an appId and a uuid) is a machine id,
// never something to put in a notification title.
const OPAQUE_ID_RE =
  /^(?:[0-9a-f]{24}(?:_[0-9a-f]{24})?|[a-z0-9]+_(?:[0-9a-f]{24}|[0-9a-f-]{36})(?:_[0-9a-z-]+)*)$/i;

function isOpaqueId(value) {
  const text = String(value || '').trim();
  return !!text && OPAQUE_ID_RE.test(text.split('@')[0]);
}

function pickTitle(raw = {}, data = {}, notification = {}) {
  const title = notification.title || raw.title || data.title || '';
  return title && !isOpaqueId(title) ? title : 'New Message';
}

// One notification per chat: a newer message in the same room replaces it.
function roomTag(data = {}) {
  const jid = String(data.jid || '').split('@')[0];
  return jid ? `ethora-room-${jid}` : '';
}

function pickBody(raw = {}, data = {}, notification = {}) {
  return notification.body || raw.body || data.body || 'You have a new message';
}

// The url the push itself names (backend messages and reactions name none).
// Only string values count: a payload field that is not a string (or a
// String.prototype method read off a non-object payload) is not a url.
function pickExplicitUrl(raw = {}, data = {}, notification = {}) {
  const candidates = [
    data.url,
    data.link,
    data.click_action,
    notification.click_action,
    raw.url,
    raw.link,
    raw.click_action,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const value = candidates[i];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function pickUrl(raw = {}, data = {}, notification = {}) {
  return normalizeUrl(pickExplicitUrl(raw, data, notification) || CLICK_URL);
}

// An icon the push itself carries (data.icon, notification.icon or icon on
// the payload) wins over the one configured for the whole app: a push about a
// specific chat or sender knows better than the app-wide default. Only http(s)
// and same-origin paths are accepted; anything else (data:, javascript:, a
// bare word) is ignored and the configured/default icon is used instead.
function sanitizeIconUrl(value) {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) return '';
  if (url.charAt(0) === '/') {
    // A path only counts when it really stays on this origin: `//host/x` and
    // `/\host/x` (a backslash is a slash to the url parser) both leave it.
    try {
      return new URL(url, self.location.origin).origin === self.location.origin
        ? url
        : '';
    } catch {
      return '';
    }
  }
  return /^https?:\/\/[^\s]+$/i.test(url) ? url : '';
}

function pickIcon(raw = {}, data = {}, notification = {}) {
  return (
    sanitizeIconUrl(data.icon) ||
    sanitizeIconUrl(notification.icon) ||
    sanitizeIconUrl(raw.icon) ||
    CUSTOM_ICON ||
    DEFAULT_ICON
  );
}

function pickBadge() {
  return CUSTOM_BADGE || DEFAULT_BADGE;
}

// A photo/video message carries a thumbnail as data.previewUrl. An image the
// push names explicitly (data.image, notification.image, image) still wins.
// Every candidate goes through sanitizeIconUrl (http(s) or a same-origin
// path), so a data:/javascript: value never reaches showNotification.
function pickImage(raw = {}, data = {}, notification = {}) {
  return (
    sanitizeIconUrl(data.image) ||
    sanitizeIconUrl(notification.image) ||
    sanitizeIconUrl(raw.image) ||
    sanitizeIconUrl(data.previewUrl) ||
    undefined
  );
}

// ── CALL DETECTION ────────────────────────────────────────────
// Mirror of helpers/callPush.ts isCallPush(). A backgrounded call push must
// (a) read as a call (persistent, call-styled title) and (b) carry its FULL
// data payload through to the click handler, otherwise the app's isCallPush()
// sees only {url,messageId,...} and can't raise the ring screen.
function pickField(data, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const v = data && data[keys[i]];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}

function isCallPushData(data) {
  if (!data) return false;
  const marker = pickField(data, [
    'type',
    'pushType',
    'category',
    'messageType',
    'event',
  ]).toLowerCase();
  if (
    marker === 'call' ||
    marker === 'incoming-call' ||
    marker === 'call-token' ||
    marker === 'call-invite'
  ) {
    return true;
  }
  const callId = pickField(data, ['callId', 'callid', 'callID']);
  const kind = pickField(data, ['kind']).toLowerCase();
  const hasCallField =
    !!pickField(data, ['callToken', 'livekitToken']) ||
    !!pickField(data, ['callKind']) ||
    kind === 'audio' ||
    kind === 'video';
  return !!callId && hasCallField;
}

function isReactionPushData(data = {}) {
  return String(data.type || '').toLowerCase() === 'reaction';
}

function callPushKind(data) {
  return pickField(data, ['callKind', 'kind']).toLowerCase() === 'audio'
    ? 'audio'
    : 'video';
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

  if (json && typeof json === 'object' && !Array.isArray(json)) {
    log('PUSH JSON', json);
    return { type: 'json', raw: json, text };
  }

  // A JSON string (`"hello"`) is a plain text push; a number, boolean or
  // array carries no message either way and is shown as the text it was sent as.
  if (typeof json === 'string') {
    return {
      type: 'text',
      raw: { title: 'New Message', body: json, data: {} },
      text,
    };
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
function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function handlePush(rawInput = {}, source = 'push') {
  // Whatever arrived, work on plain objects only: a string payload would
  // otherwise expose String.prototype members (raw.link) as fields, and a
  // string `data` would be spread character by character.
  const raw = isPlainObject(rawInput) ? rawInput : {};
  const data = isPlainObject(raw.data) ? raw.data : {};
  const notification = isPlainObject(raw.notification) ? raw.notification : {};

  const title = pickTitle(raw, data, notification);
  const body = pickBody(raw, data, notification);
  const url = pickUrl(raw, data, notification);
  const icon = pickIcon(raw, data, notification);
  const badge = pickBadge();
  const image = pickImage(raw, data, notification);

  const messageId = extractMessageId(raw, data);
  const isReaction = isReactionPushData(data);
  const dedupKey = isReaction
    ? `reaction:${simpleHash(
        stableStringify({ title, body, jid: data.jid, msgID: data.msgID })
      )}`
    : makeDedupKey(raw, data, notification);
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
  const hasAnyClient = windowClients.length > 0;

  if (DEBUG) log('clients:', dumpClients(windowClients));
  log('visibleClientExists:', visible, 'anyClientExists:', hasAnyClient);

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

  const isCall = isCallPushData(data);
  const callerName = isCall
    ? pickField(data, [
        'callerName',
        'callerDisplayName',
        'senderName',
        'title',
      ])
    : '';
  const callId = isCall
    ? pickField(data, ['callId', 'callid', 'callID'])
    : '';

  // Call pushes: a call-styled title, a tag keyed on the callId so repeat
  // call-token pushes replace (not stack), and requireInteraction so the
  // ring notification persists until the user answers/dismisses.
  const notifTitle = isCall
    ? `Incoming ${callPushKind(data)} call${callerName ? ` · ${callerName}` : ''}`
    : title;
  const notifBody = isCall ? 'Tap to answer' : body;

  const options = {
    body: notifBody,
    icon,
    badge,
    image,
    // A reaction replaces the chat's previous reaction, never its message
    // notification; it comes in silent, the way it does on mobile.
    tag: isCall
      ? `call:${callId || dedupKey}`
      : isReaction && roomTag(data)
        ? `${roomTag(data)}#reaction`
        : roomTag(data) || dedupKey,
    silent: isReaction,
    // A reaction is already silent, so it does not set renotify on top.
    renotify: !isReaction && (isCall || !!roomTag(data)),
    requireInteraction: isCall,
    // Spread the ORIGINAL payload first so the click handler's isCallPush()
    // sees the full call fields (callId/callToken/kind/room); our routing
    // fields win on top.
    data: {
      ...data,
      url,
      // true only when the push carried its own url; the click handler never
      // navigates an open tab to the default (app root) url.
      urlExplicit: !!pickExplicitUrl(raw, data, notification),
      messageId,
      dedupKey,
      source,
    },
  };

  // Calls: a client that's merely backgrounded (open, just not the
  // visible/focused tab) is NOT the "nobody will hear this ring" case -
  // VideoCallOverlay already rings its own OS notification for exactly
  // that state (see its comment: this SW push is meant to be the
  // fully-offline fallback). `visible` collapses "backgrounded but open"
  // and "fully closed" into the same false, which duplicated that
  // client-side ring every time the tab was merely hidden. Suppress on
  // ANY open client for calls; regular messages keep the visible-only
  // check they already had.
  const suppress = isCall ? hasAnyClient : visible;

  if (!suppress) {
    log('SHOW NOTIFICATION', {
      reason: isCall ? 'NO_CLIENT_AT_ALL' : 'NO_VISIBLE_CLIENT',
      tag: options.tag,
      isCall,
    });

    return self.registration.showNotification(notifTitle, options);
  }

  log('SKIP NOTIFICATION', {
    reason: isCall ? 'CLIENT_OPEN_WILL_RING_ITSELF' : 'VISIBLE_CLIENT',
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

        return await handlePush(raw, `raw_push_${type}`);
      } catch (e) {
        error('PUSH HANDLER ERROR', e);
      }
    })()
  );
});

// ── PENDING CLICK (cold start) ────────────────────────────────
// A tap with no open window opens one, but the new page has not loaded yet,
// so a postMessage would be lost. The click payload is kept in Cache Storage
// (survives the worker being stopped), and the page asks for it with
// GET_PENDING_PUSH_CLICK once its message listener is attached. It is handed
// out once and expires after PENDING_CLICK_TTL.
const PENDING_CLICK_TTL = 2 * 60 * 1000;
const PENDING_CACHE = 'ethora-push-pending-v1';
const PENDING_KEY = `${APP_URL}/__ethora_pending_push_click__`;
let pendingQueue = Promise.resolve();

// Serialise cache access so two concurrent requests cannot both read the
// same pending click before either deletes it.
function enqueuePending(task) {
  const run = pendingQueue.then(task, task);
  pendingQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function savePendingClick(payload) {
  return enqueuePending(async () => {
    try {
      const cache = await caches.open(PENDING_CACHE);
      await cache.put(
        PENDING_KEY,
        new Response(JSON.stringify({ ts: Date.now(), payload }), {
          headers: { 'Content-Type': 'application/json' },
        })
      );
    } catch (e) {
      warn('savePendingClick failed', e);
    }
  });
}

function takePendingClick() {
  return enqueuePending(async () => {
    try {
      const cache = await caches.open(PENDING_CACHE);
      const hit = await cache.match(PENDING_KEY);
      if (!hit) return null;
      await cache.delete(PENDING_KEY);
      const record = await hit.json();
      if (!record || !record.payload) return null;
      if (Date.now() - Number(record.ts || 0) > PENDING_CLICK_TTL) return null;
      return record.payload;
    } catch (e) {
      warn('takePendingClick failed', e);
      return null;
    }
  });
}

// Same page, ignoring query and hash: a tab on /chat?chatId=x is already on
// the route a push to /chat names.
function samePage(a, b) {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return left.origin === right.origin && left.pathname === right.pathname;
  } catch {
    return a === b;
  }
}

// A cold-start tap opens a fresh window. Hand the page the room (and message)
// to open through the url as well: ids only, never tokens or message text.
// The page treats `fromPush=1` like a tap and then drops the pending click, so
// the two routes never both apply. Calls keep to the pending click (their
// token cannot travel in a url), and a url that already names a chat, or that
// leaves this origin, is left as it is.
function withPushParams(urlString, data) {
  if (isCallPushData(data)) return urlString;
  const room = String(data.jid || data.roomJid || '').split('@')[0].trim();
  if (!room) return urlString;
  try {
    const next = new URL(urlString);
    if (next.origin !== self.location.origin) return urlString;
    if (next.searchParams.has('chatId')) return urlString;
    next.searchParams.set('fromPush', '1');
    next.searchParams.set('chatId', room);
    const msgId = String(data.msgID || '').trim();
    if (msgId) next.searchParams.set('messageId', msgId);
    return next.toString();
  } catch {
    return urlString;
  }
}

function inScope(client) {
  try {
    return client.url.startsWith(
      (self.registration && self.registration.scope) || self.location.origin
    );
  } catch {
    return false;
  }
}

function sameOrigin(client) {
  try {
    return client.url.startsWith(self.location.origin);
  } catch {
    return false;
  }
}

// Prefer a window inside the worker scope (focused first), then any
// same-origin window.
function pickClient(allClients) {
  return (
    allClients.find((c) => inScope(c) && c.focused) ||
    allClients.find(inScope) ||
    allClients.find(sameOrigin) ||
    allClients[0]
  );
}

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'GET_PENDING_PUSH_CLICK') return;
  const source = event.source;
  event.waitUntil(
    (async () => {
      const payload = await takePendingClick();
      // discard: the page already took the click from the url (fromPush=1),
      // so the copy is only dropped, never replayed.
      if (event.data.discard === true) return;
      if (!payload || !source) return;
      try {
        source.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', ...payload });
      } catch {}
    })()
  );
});

// ── CLICK ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  log('NOTIFICATION CLICK', event.notification);

  event.notification.close();

  const notificationData = event.notification?.data || {};
  const url = notificationData.url || CLICK_URL;

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const targetUrl = normalizeUrl(url);

      // The full data object travels to the page, call fields included.
      const payload = {
        data: notificationData,
        notification: {
          title: event.notification?.title || '',
          body: event.notification?.body || '',
        },
      };

      const send = (client) => {
        try {
          client.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', ...payload });
        } catch {}
        // Backward compatibility for any legacy listeners in app code
        try {
          client.postMessage({
            type: 'OPEN_FROM_PUSH',
            url: targetUrl,
            notificationData,
          });
        } catch {}
      };

      const preferredClient = pickClient(allClients);

      if (preferredClient) {
        // Warm tap: never open a second window and never reload the user's
        // tab. Navigate only when the push named its own url and the tab is
        // not already there; the new document then asks for the pending click.
        if (
          notificationData.urlExplicit === true &&
          !samePage(targetUrl, preferredClient.url) &&
          'navigate' in preferredClient
        ) {
          await savePendingClick(payload);
          try {
            const navigated = await preferredClient.navigate(targetUrl);
            try {
              await (navigated || preferredClient).focus();
            } catch {}
            return;
          } catch (e) {
            // Uncontrolled client, or a url it may not go to: stay on the
            // page, message it directly, and drop the pending copy.
            warn('client navigate failed', e);
            await takePendingClick();
          }
        }

        try {
          if ('focus' in preferredClient) await preferredClient.focus();
        } catch (e) {
          warn('client focus failed', e);
        }

        send(preferredClient);
        return;
      }

      // Cold start: no window to message yet. Keep the payload for the page.
      await savePendingClick(payload);
      return clients.openWindow(withPushParams(targetUrl, notificationData));
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
