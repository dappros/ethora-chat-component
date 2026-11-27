// Recognise and parse an *incoming call* push notification.
//
// Calls normally ring via a live XMPP `call-token` stanza, which only arrives
// while the socket is connected. When the app is backgrounded/closed that
// stanza is missed, so the backend (will) also deliver the call over push - in
// the same `data`-payload format as message pushes. This helper lets the push
// layer tell a call push apart from a chat push and pull the call fields out,
// tolerating the field-name variations backends tend to use.

import type { CallMode } from '../calls/callMode';
import { CALL_ANSWER_BUFFER_MS } from '../calls/callTiming';

export interface ParsedCallPush {
  callId: string | null;
  /** LiveKit token for calls that use LiveKit. */
  token: string | null;
  mode: CallMode;
  kind: 'audio' | 'video';
  /** Bare room name (JID localpart) the call belongs to. */
  roomBareName: string | null;
  /** Raw room reference from the payload (full JID or bare name). */
  roomRef: string | null;
  /** Display name for the ring screen (caller). */
  callerName: string | null;
  /** Caller's xmpp localpart, when provided. */
  callerXmppUsername: string | null;
  /** The call is for a group room (always LiveKit). */
  isGroup: boolean;
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
  const isGroup = ['true', '1'].includes(pick(d, ['group', 'isGroup']).toLowerCase());
  return {
    callId: pick(d, ['callId', 'callid', 'callID']) || null,
    token: pick(d, ['callToken', 'livekitToken', 'token']) || null,
    mode: !isGroup && pick(d, ['mode']).toLowerCase() === 'p2p' ? 'p2p' : 'livekit',
    // The server defaults a push without `kind` to audio, so the client does
    // too; anything but an explicit "video" is an audio call.
    kind: kindRaw === 'video' ? 'video' : 'audio',
    roomBareName,
    roomRef,
    callerName:
      pick(d, ['callerName', 'callerDisplayName', 'senderName', 'title']) ||
      null,
    callerXmppUsername:
      pick(d, ['callerXmppUsername', 'callerUsername', 'senderJid'])
        .split('@')[0] || null,
    isGroup,
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

const readEpochMs = (value: unknown): number => {
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? ms : Infinity;
};

/** The earlier of the server expiry, token expiry and the page's answer deadline. */
export const getCallPushFreshness = (
  data: Record<string, any> | null | undefined,
  now: number = Date.now()
): { fresh: boolean; answerUntil: number | null } => {
  const expiresAt = Math.min(
    readEpochMs(data?.expiresAt),
    jwtExpiresAtMs(parseCallPush(data).token) ?? Infinity
  );
  const answerUntil = Math.min(
    readEpochMs(data?.answerUntil),
    expiresAt - CALL_ANSWER_BUFFER_MS
  );
  return {
    fresh: now < answerUntil,
    answerUntil: Number.isFinite(answerUntil) ? answerUntil : null,
  };
};
