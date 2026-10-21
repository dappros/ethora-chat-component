// Recognise and parse an *incoming call* push notification.
//
// Calls normally ring via a live XMPP `call-token` stanza, which only arrives
// while the socket is connected. When the app is backgrounded/closed that
// stanza is missed, so the backend (will) also deliver the call over push - in
// the same `data`-payload format as message pushes. This helper lets the push
// layer tell a call push apart from a chat push and pull the call fields out,
// tolerating the field-name variations backends tend to use.

export interface ParsedCallPush {
  callId: string | null;
  /** LiveKit token, if the push carried one (lets us ring + accept offline). */
  token: string | null;
  kind: 'audio' | 'video';
  /** Bare room name (JID localpart) the call belongs to. */
  roomBareName: string | null;
  /** Raw room reference from the payload (full JID or bare name). */
  roomRef: string | null;
  /** Display name for the ring screen (caller). */
  callerName: string | null;
  /** Caller's xmpp localpart, when provided. */
  callerXmppUsername: string | null;
}

const pick = (data: Record<string, any>, keys: string[]): string => {
  for (const k of keys) {
    const v = data?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
};

/**
 * True when a push `data` payload represents an incoming call. Matches on an
 * explicit call marker (`type`/`pushType`/`category`/`event` === "call"-ish)
 * or on a callId paired with a call-specific field, so a normal message push
 * is never misread as a call.
 */
export const isCallPush = (data: Record<string, any> | null | undefined): boolean => {
  if (!data) return false;
  const marker = pick(data, [
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
  const callId = pick(data, ['callId', 'callid', 'callID']);
  const hasCallField =
    !!pick(data, ['callToken', 'livekitToken']) ||
    !!pick(data, ['callKind']) ||
    pick(data, ['kind']).toLowerCase() === 'audio' ||
    pick(data, ['kind']).toLowerCase() === 'video';
  return !!callId && hasCallField;
};

export const parseCallPush = (
  data: Record<string, any> | null | undefined
): ParsedCallPush => {
  const d = data || {};
  const roomRef =
    pick(d, ['callRoom', 'room', 'roomJid', 'jid', 'chatId']) || null;
  const roomBareName = roomRef ? roomRef.split('@')[0] || roomRef : null;
  const kindRaw = pick(d, ['callKind', 'kind']).toLowerCase();
  return {
    callId: pick(d, ['callId', 'callid', 'callID']) || null,
    token: pick(d, ['callToken', 'livekitToken', 'token']) || null,
    // The server defaults a push without `kind` to audio, so the client does
    // too; anything but an explicit "video" is an audio call.
    kind: kindRaw === 'video' ? 'video' : 'audio',
    roomBareName,
    roomRef,
    callerName:
      pick(d, ['callerName', 'callerDisplayName', 'senderName', 'title']) ||
      null,
    callerXmppUsername:
      pick(d, ['callerXmppUsername', 'callerUsername', 'userJid', 'senderJid'])
        .split('@')[0] || null,
  };
};

/**
 * Decode the claims of a JWT without verifying it. Only non-sensitive claims
 * are ever read from the result; the server (and LiveKit on connect) is the
 * authority on validity. Returns null for anything that is not a JWT.
 */
export const decodeJwtPayload = (
  token: string | null | undefined
): Record<string, any> | null => {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const decoded =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('binary');
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

/** Expiry of a JWT (`exp`, seconds) as epoch milliseconds, or null. */
export const jwtExpiresAtMs = (token: string | null | undefined): number | null => {
  const exp = Number(decodeJwtPayload(token)?.exp);
  return Number.isFinite(exp) && exp > 0 ? exp * 1000 : null;
};

/** A call token with less than this left is treated as already expired. */
export const CALL_TOKEN_MIN_REMAINING_MS = 3000;

/**
 * Whether a call push is still worth ringing for. The backend sets no push TTL,
 * so a device that was offline can receive a call push long after the call.
 * The LiveKit token lives 60 s, so its `exp` is the freshness clock.
 *
 * When no `exp` can be read (no token, malformed token) the push is treated
 * as fresh: it cannot be proven stale, and the ring's own 45 s timeout bounds
 * how long it can stay on screen.
 */
export const getCallPushFreshness = (
  data: Record<string, any> | null | undefined,
  now: number = Date.now()
): { fresh: boolean; expiresAt: number | null } => {
  const expiresAt = jwtExpiresAtMs(parseCallPush(data).token);
  if (expiresAt === null) return { fresh: true, expiresAt: null };
  return { fresh: expiresAt - now >= CALL_TOKEN_MIN_REMAINING_MS, expiresAt };
};
