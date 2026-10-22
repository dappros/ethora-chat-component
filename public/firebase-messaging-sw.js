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

// The server defaults a call push without `kind` to audio.
function callPushKind(data) {
  return pickField(data, ['callKind', 'kind']).toLowerCase() === 'video'
    ? 'video'
    : 'audio';
}

// ── CALL FRESHNESS ────────────────────────────────────────────
// The backend sends call pushes without a TTL, so a device that was offline can
// receive one long after the call. The LiveKit token in the push lives 60 s, so
// its `exp` is the freshness clock (mirror of helpers/callPush.ts).
const CALL_MIN_REMAINING_MS = 3000;
const CALL_ACK_TIMEOUT_MS = 1500;
const CALL_KEEPALIVE_CAP_MS = 60 * 1000;
const CALL_ACTIONS = [
  { action: 'answer', title: 'Answer' },
  { action: 'decline', title: 'Decline' },
];

function callTokenOf(data) {
  return pickField(data, ['callToken', 'livekitToken', 'token']);
}

function callIdOf(data) {
  return pickField(data, ['callId', 'callid', 'callID']);
}

function callRoomOf(data) {
  return pickField(data, ['callRoom', 'room', 'roomJid', 'jid', 'chatId']);
}

function jwtExpiresAtMs(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const exp = Number(JSON.parse(atob(padded)).exp);
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
  } catch {
    return null;
  }
}

// No readable exp (no token, malformed token): treated as fresh, because it
// cannot be proven stale. The ring is still bounded: it never outlives
// receivedAt + CALL_KEEPALIVE_CAP_MS (the backend's own TTL for a call).
function callPushFreshness(data, now) {
  const expiresAt = jwtExpiresAtMs(callTokenOf(data));
  if (expiresAt === null) return { fresh: true, expiresAt: null };
  return { fresh: expiresAt - now >= CALL_MIN_REMAINING_MS, expiresAt };
}

// One key for a call on both sides (the worker and the page, see
// utils/callNotifications.ts): the callId, or the room when the push has none.
// The OS notification tag is `call:<key>` and the missed-call marker uses the
// same key, so the two can never leave two notifications for one call.
function callRoomBare(data) {
  return callRoomOf(data).split('@')[0].trim();
}

function callKeyOf(data) {
  const callId = callIdOf(data);
  if (callId) return callId;
  const room = callRoomBare(data);
  return room ? `room:${room}` : '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const callId = isCall ? callIdOf(data) : '';
  const callKey = isCall ? callKeyOf(data) || dedupKey : '';
  // A call without a LiveKit token cannot be answered from the notification.
  const canAnswer = isCall && !!callTokenOf(data);

  // Call pushes: a call-styled title, a tag keyed on the callId so repeat
  // call-token pushes replace (not stack), and requireInteraction so the
  // ring notification persists until the user answers/dismisses.
  const notifTitle = isCall
    ? `Incoming ${callPushKind(data)} call${callerName ? ` · ${callerName}` : ''}`
    : title;
  const notifBody = isCall
    ? canAnswer
      ? 'Tap to answer'
      : 'Tap to open the chat'
    : body;

  const options = {
    body: notifBody,
    icon,
    badge,
    image,
    // A reaction replaces the chat's previous reaction, never its message
    // notification; it comes in silent, the way it does on mobile.
    tag: isCall
      ? `call:${callKey}`
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
      // A call tap or Answer goes to the configured click url, never to a url
      // the payload names: the pending click carries the call, not the url.
      url: isCall ? CLICK_URL : url,
      // true only when the push carried its own url; the click handler never
      // navigates an open tab to the default (app root) url.
      urlExplicit: isCall ? false : !!pickExplicitUrl(raw, data, notification),
      messageId,
      dedupKey,
      source,
    },
  };

  if (isCall) {
    return handleCallPush({
      data,
      options: {
        ...options,
        actions: canAnswer ? CALL_ACTIONS : CALL_ACTIONS.filter((a) => a.action === 'decline'),
      },
      title: notifTitle,
      callId,
      callerName,
      windowClients,
      icon,
      badge,
    });
  }

  if (!visible) {
    log('SHOW NOTIFICATION', {
      reason: 'NO_VISIBLE_CLIENT',
      tag: options.tag,
    });

    return self.registration.showNotification(notifTitle, options);
  }

  log('SKIP NOTIFICATION', { reason: 'VISIBLE_CLIENT' });
}

// ── CALL PUSH ─────────────────────────────────────────────────
// A call push is never decided by "does a window exist": a hidden tab with a
// dead socket never rings itself. Instead every window is asked (CALL_PUSH)
// and one that is VISIBLE and now shows the ring answers CALL_PUSH_ACK. With no
// ack inside CALL_ACK_TIMEOUT_MS the worker shows the OS notification itself.
// An ack can also say the page is busy with another call (`busy`): the worker
// then shows a plain "Missed call" instead of a ring nobody could answer.
//
// The same wait serves the Decline hand-off (CALL_PUSH_DECLINE_ACK): the page
// acks only after it really handled the decline.
const ackWaiters = new Map();

// Resolves { result: 'ack', source } as soon as an ack arrives (`source` is the
// window that sent it), { result: 'busy' } when the time is up and only busy
// acks came in (another tab may still ring, so a busy ack does not cut the wait
// short), { result: 'none' } otherwise.
function waitForAck(kind, callId, ms) {
  return new Promise((resolve) => {
    const key = `${kind}:${callId || ''}`;
    let timer = null;
    let busySeen = false;
    const waiter = {
      onAck(busy, source) {
        if (busy) {
          busySeen = true;
          return;
        }
        finish('ack', source);
      },
    };
    const finish = (result, source) => {
      const set = ackWaiters.get(key);
      if (set) {
        set.delete(waiter);
        if (!set.size) ackWaiters.delete(key);
      }
      if (timer !== null) clearTimeout(timer);
      resolve({ result, source });
    };
    if (!ackWaiters.has(key)) ackWaiters.set(key, new Set());
    ackWaiters.get(key).add(waiter);
    timer = setTimeout(() => finish(busySeen ? 'busy' : 'none'), ms);
  });
}

function resolveAck(kind, callId, busy, source) {
  const set = ackWaiters.get(`${kind}:${callId || ''}`);
  if (!set) return;
  Array.from(set).forEach((waiter) => waiter.onAck(busy === true, source));
}

// Runs `task` while holding a Web Lock shared with the pages of this origin, so
// the page and the worker never show the same "Missed call" at the same moment
// (two showNotification calls with one tag replace each other and alert twice).
// Without Web Locks the task just runs.
async function withLock(name, task) {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
  if (!locks || typeof locks.request !== 'function') return task();
  let ran = false;
  try {
    return await locks.request(name, async () => {
      ran = true;
      return task();
    });
  } catch (e) {
    if (ran) throw e;
    return task();
  }
}

// A call that was missed (stale push, nobody answered before the call ended, or
// the page was busy with another call) is a normal notification: not sticky,
// one per room, tap opens the room. It deliberately carries no callId/kind, so
// the page's isCallPush() does not take it for a call. The page shows the same
// notification itself when it times a ring out (same tag, same data), so
// whichever gets there first wins; `missedCallId` tells a repeat of the same
// call from the next missed call in the room.
async function showMissedCall(data, icon, badge) {
  const callerName = pickField(data, [
    'callerName',
    'callerDisplayName',
    'senderName',
    'title',
  ]);
  const room = callRoomOf(data);
  const bare = callRoomBare(data);
  const tag = `missed-call:${bare || callIdOf(data)}`;
  const missedCallId = callKeyOf(data);
  // The check and the show are one step under a lock the page takes too (see
  // showMissedCallNotification): when both see the ring end in the same few
  // milliseconds, the second finds the first one's notification and leaves it.
  return withLock(`ethora-missed-call:${tag}`, async () => {
    if (missedCallId) {
      try {
        const existing = await self.registration.getNotifications({ tag });
        if (
          existing &&
          existing.some((n) => n.data && n.data.missedCallId === missedCallId)
        ) {
          return;
        }
      } catch (e) {
        warn('getNotifications failed', e);
      }
    }
    return self.registration.showNotification(
      `Missed ${callPushKind(data)} call${callerName ? ` · ${callerName}` : ''}`,
      {
        body: 'Tap to open the chat',
        icon,
        badge,
        tag,
        renotify: true,
        requireInteraction: false,
        data: {
          type: 'missed-call',
          jid: room,
          callerName,
          missedCallId,
          url: CLICK_URL,
          urlExplicit: false,
          source: 'missed-call',
        },
      }
    );
  });
}

// Keeps the event alive until the ring ends, then swaps a ring that is still on
// screen for the "Missed call" notification. The ring ends at the token's exp,
// but never later than receivedAt + 60 s (the backend's TTL for a call): a push
// with no readable exp, or an exp further away, must not stay sticky forever
// when no page is open to end it. Runs for the rings this worker shows itself
// (push) and for the ones a page shows through the registration
// (CALL_RING_SHOWN): a page-shown ring is persistent too, and the tab that
// showed it can be closed before the ring is over. One watcher per tag.
const expiryWatchers = new Set();

async function expireCallNotification({ tag, data, endAt, icon, badge }) {
  if (expiryWatchers.has(tag)) return;
  expiryWatchers.add(tag);
  try {
    // A timer can fire a millisecond before the clock reads endAt; waking up
    // early and giving up would leave the ring on screen for good.
    for (let wait = endAt - Date.now(); wait > 0; wait = endAt - Date.now()) {
      await sleep(wait);
    }
    let open = [];
    try {
      open = await self.registration.getNotifications({ tag });
    } catch (e) {
      warn('getNotifications failed', e);
    }
    if (!open || !open.length) return;
    open.forEach((n) => {
      try {
        n.close();
      } catch {}
    });
    await showMissedCall(data, icon, badge);
  } finally {
    expiryWatchers.delete(tag);
  }
}

async function handleCallPush({
  data,
  options,
  title,
  callId,
  windowClients,
  icon,
  badge,
}) {
  const receivedAt = Date.now();
  const { fresh, expiresAt } = callPushFreshness(data, receivedAt);

  if (!fresh) {
    log('STALE CALL PUSH', { callId, expiresAt });
    return showMissedCall(data, icon, badge);
  }

  if (windowClients.length) {
    const acked = waitForAck('call', callId, CALL_ACK_TIMEOUT_MS);
    windowClients.forEach((c) => {
      try {
        c.postMessage({ type: 'CALL_PUSH', data });
      } catch {}
    });
    const result = await acked;
    if (result.result === 'ack') {
      log('CALL RINGS IN PAGE', { callId });
      return;
    }
    if (result.result === 'busy') {
      log('CALL PAGE BUSY', { callId });
      return showMissedCall(data, icon, badge);
    }
  }

  log('SHOW CALL NOTIFICATION', { tag: options.tag });
  await self.registration.showNotification(title, options);
  await expireCallNotification({
    tag: options.tag,
    data,
    endAt: Math.min(
      expiresAt === null ? Infinity : expiresAt,
      receivedAt + CALL_KEEPALIVE_CAP_MS
    ),
    icon,
    badge,
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

// ── CALL CLIENTS ──────────────────────────────────────────────
// Which windows can take a call over. A page announces it (CALL_CLIENT_READY)
// when it has the call push listener mounted with videoCalls enabled, and again
// when the worker asks (CALL_CLIENT_PROBE, sent when the worker starts, since a
// restarted worker has forgotten who was ready). A host page with no <Chat>
// never announces, so the worker knows, without waiting for a reply that will
// not come, that handing it an Answer is pointless. Per client id; an id that
// is no longer an open window is simply never looked up.
const readyClients = new Map();
const CALL_PROBE_GRACE_MS = 300;
const workerStartedAt = Date.now();
let startupWindows = 0;

(async () => {
  try {
    const open = await clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    startupWindows = open.length;
    open.forEach((c) => {
      try {
        c.postMessage({ type: 'CALL_CLIENT_PROBE' });
      } catch {}
    });
  } catch (e) {
    warn('startup probe failed', e);
  }
})();

function isReadyClient(client) {
  return !!client && !!client.id && readyClients.get(client.id) === true;
}

// The windows that can take a call over. Just after the worker (re)started the
// pages are still answering its probe: wait out a short grace for them rather
// than treat every tab as unable to handle it.
async function readyWindowsOf(allClients) {
  let ready = allClients.filter(isReadyClient);
  if (!ready.length && startupWindows > 0) {
    const left = CALL_PROBE_GRACE_MS - (Date.now() - workerStartedAt);
    if (left > 0) {
      await sleep(left);
      ready = allClients.filter(isReadyClient);
    }
  }
  return ready;
}

// Focused in-scope window first, then any in-scope, then same-origin.
function orderClients(list) {
  const rank = (c) => (inScope(c) ? (c.focused ? 0 : 1) : sameOrigin(c) ? 2 : 3);
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map((x) => x.c);
}

function sameClient(a, b) {
  return !!a && !!b && (a === b || (!!a.id && a.id === b.id));
}

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'CALL_PUSH_ACK') {
    resolveAck(
      'call',
      String(event.data.callId || ''),
      event.data.busy === true,
      event.source
    );
    return;
  }
  if (type === 'CALL_PUSH_DECLINE_ACK') {
    resolveAck('decline', String(event.data.callId || ''), false, event.source);
    return;
  }
  if (type === 'CALL_PUSH_ANSWER_ACK') {
    resolveAck('answer', String(event.data.callId || ''), false, event.source);
    return;
  }
  if (type === 'CALL_CLIENT_READY') {
    const id = event.source && event.source.id;
    if (!id) return;
    if (event.data.ready === false) readyClients.delete(id);
    else readyClients.set(id, true);
    return;
  }
  // A page showed a call notification through the registration. It is
  // persistent, and the tab that showed it may close before the ring is over:
  // the worker ends it (Missed call) at the token's exp like a ring of its own.
  if (type === 'CALL_RING_SHOWN') {
    const info = isPlainObject(event.data.data) ? event.data.data : {};
    const key = String(event.data.key || '').trim() || callKeyOf(info);
    if (!key) return;
    const exp = Number(event.data.exp);
    const now = Date.now();
    event.waitUntil(
      expireCallNotification({
        tag: `call:${key}`,
        data: info,
        endAt: Math.min(
          Number.isFinite(exp) && exp > 0 ? exp : Infinity,
          now + CALL_KEEPALIVE_CAP_MS
        ),
        icon: sanitizeIconUrl(event.data.icon) || pickIcon({}, info, {}),
        badge: sanitizeIconUrl(event.data.badge) || pickBadge(),
      })
    );
    return;
  }
  if (type !== 'GET_PENDING_PUSH_CLICK') return;
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

// ── CALL DECLINE ──────────────────────────────────────────────
// Declining from the notification never opens a window. Every open page is
// asked; the one that takes it does the work (XMPP call-state plus the REST
// call, and it clears its ring) and answers CALL_PUSH_DECLINE_ACK once it has.
// A window that cannot do it (a host
// page with no <Chat>, the config not loaded yet) never acks, and the worker
// then calls the REST decline itself after CALL_DECLINE_ACK_TIMEOUT_MS, as it
// does with no page at all. It uses the user token the page mirrored into Cache
// Storage (the same token the SDK already keeps in the origin's localStorage);
// with no mirrored token it only closes the notification and the caller times
// out.
const CALL_DECLINE_ACK_TIMEOUT_MS = 1500;
const CALL_AUTH_CACHE = 'ethora-push-auth-v1';
const CALL_AUTH_KEY = `${APP_URL}/__ethora_call_auth__`;

async function readCallAuth() {
  try {
    const cache = await caches.open(CALL_AUTH_CACHE);
    const hit = await cache.match(CALL_AUTH_KEY);
    if (!hit) return null;
    const auth = await hit.json();
    return auth && auth.token && auth.apiBaseUrl ? auth : null;
  } catch (e) {
    warn('readCallAuth failed', e);
    return null;
  }
}

async function declineCallViaApi(data) {
  const callId = callIdOf(data);
  if (!callId) return;
  const auth = await readCallAuth();
  if (!auth) return;
  try {
    await fetch(
      `${String(auth.apiBaseUrl).replace(/\/+$/, '')}/v1/chats/call/state/decline/${encodeURIComponent(callId)}`,
      { method: 'POST', headers: { Authorization: auth.token } }
    );
  } catch (e) {
    // Best effort: CALL_NOT_FOUND (the call is already over), an expired token
    // or being offline all just leave the caller to time out.
    warn('decline request failed', e);
  }
}

// Declining goes to EVERY open window and the first that handled it acks. Which
// tab that is cannot be known here: a host page with no <Chat> cannot do it, a
// tab can be mid-reload, a second tab with the same call ringing must not do it
// twice (the pages settle that between themselves, see callBroadcast.ts).
async function handleCallDecline(data) {
  const allClients = await clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  if (allClients.length) {
    const acked = waitForAck('decline', callIdOf(data), CALL_DECLINE_ACK_TIMEOUT_MS);
    allClients.forEach((c) => {
      try {
        c.postMessage({ type: 'CALL_PUSH_DECLINE', data });
      } catch {}
    });
    if ((await acked).result === 'ack') return;
    log('CALL DECLINE NOT ACKED, declining over REST', { callId: callIdOf(data) });
  }
  await declineCallViaApi(data);
}

// ── CALL ANSWER / TAP ─────────────────────────────────────────
// A tap on a call notification, or its Answer action, must end up in a window
// that can really take the call. The windows the worker knows can (see
// readyClients) all get the click and the one that took it acks
// (CALL_PUSH_ANSWER_ACK); the other tabs end their own ring when they learn the
// call was taken (callBroadcast.ts). When nobody acks, or no open window can
// take it (a host page with no <Chat>), the click is kept as a pending click and
// the user is brought to the chat page, where the new document asks for it.
//
// Order matters because the browser only lets the worker focus or open a window
// for a short time after the click (user activation, about a second). So:
//  - the best ready window is focused at once, before any waiting;
//  - with no ready window there is nothing to wait for: focus and navigate an
//    open tab, or open a window, right away while the click is fresh;
//  - after an ack from a different window than the focused one, that one is
//    focused too (best effort);
//  - after a timeout navigating a controlled tab (needs no activation) is
//    preferred over openWindow, which may be refused by then. A refused
//    openWindow leaves the pending click for the next page load (2 min TTL).
const CALL_CLICK_ACK_TIMEOUT_MS = 1500;

// Called straight away (not from a later microtask): focus() only works while
// the click's user activation is fresh.
function focusClient(client) {
  try {
    if (!client || typeof client.focus !== 'function') return Promise.resolve();
    return Promise.resolve(client.focus()).catch((e) =>
      warn('client focus failed', e)
    );
  } catch (e) {
    warn('client focus failed', e);
    return Promise.resolve();
  }
}

async function bringCallClickToApp({ allClients, readyClients: skip, payload, targetUrl }) {
  await savePendingClick(payload);
  const candidates = orderClients(allClients).filter(
    (c) => !skip.some((r) => sameClient(r, c)) && 'navigate' in c
  );
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const focused = focusClient(candidate);
    try {
      const navigated = await candidate.navigate(targetUrl);
      await focused;
      if (navigated && navigated !== candidate) await focusClient(navigated);
      return;
    } catch (e) {
      // An uncontrolled client, or a url it may not go to: try the next one.
      warn('client navigate failed', e);
    }
  }
  try {
    await clients.openWindow(withPushParams(targetUrl, payload.data || {}));
  } catch (e) {
    warn('openWindow failed', e);
  }
}

async function handleCallClick({ notificationData, targetUrl, payload }) {
  const callId = callIdOf(notificationData);
  const allClients = await clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  if (!allClients.length) {
    // Cold start: no window to message yet. Keep the payload for the page.
    await savePendingClick(payload);
    return clients.openWindow(withPushParams(targetUrl, notificationData));
  }

  const ready = await readyWindowsOf(allClients);
  if (ready.length) {
    const best = orderClients(ready)[0];
    const focused = focusClient(best);
    const acked = waitForAck('answer', callId, CALL_CLICK_ACK_TIMEOUT_MS);
    allClients.forEach((c) => {
      try {
        c.postMessage({ type: 'PUSH_NOTIFICATION_CLICK', ...payload });
      } catch {}
      // Backward compatibility for any legacy listeners in app code
      try {
        c.postMessage({
          type: 'OPEN_FROM_PUSH',
          url: targetUrl,
          notificationData,
        });
      } catch {}
    });
    const { result, source } = await acked;
    await focused;
    if (result === 'ack') {
      const taker = allClients.find((c) => sameClient(c, source)) || source;
      if (taker && !sameClient(taker, best)) await focusClient(taker);
      return;
    }
    log('CALL CLICK NOT ACKED, opening the app', { callId });
  }

  await bringCallClickToApp({
    allClients,
    readyClients: ready,
    payload,
    targetUrl,
  });
}

// ── CLICK ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  log('NOTIFICATION CLICK', event.notification);

  event.notification.close();

  const notificationData = event.notification?.data || {};
  const url = notificationData.url || CLICK_URL;
  const action = String(event.action || '');

  if (action === 'decline' && isCallPushData(notificationData)) {
    event.waitUntil(handleCallDecline(notificationData));
    return;
  }

  // The full data object travels to the page, call fields included.
  const payload = {
    data: notificationData,
    notification: {
      title: event.notification?.title || '',
      body: event.notification?.body || '',
    },
    // 'answer' on a call notification: the page raises the call and
    // accepts it straight away.
    ...(action ? { action } : {}),
  };

  if (isCallPushData(notificationData)) {
    event.waitUntil(
      handleCallClick({
        notificationData,
        targetUrl: normalizeUrl(url),
        payload,
      })
    );
    return;
  }

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const targetUrl = normalizeUrl(url);

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
