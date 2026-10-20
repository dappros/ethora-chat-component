// Pure helpers that decide HOW a call is carried, shared by the dialer
// (ChatHeader), the stanza handler (callTokenStanza) and the overlay.
//
// Three kinds of call exist:
//   - 1:1 over our own WebRTC peer connection ("p2p"): chosen by the server,
//     only for private chats and only when the install has P2P enabled;
//   - 1:1 over LiveKit: the fallback when the server answers `livekit`;
//   - group over LiveKit: any non-private chat, always `livekit`.
// The client never picks the transport, it follows the server's `mode`.

import { sanitizeCallName, sanitizeXmppUsername } from './callDisplay';

export type CallMode = 'livekit' | 'p2p';
export type CallKindName = 'audio' | 'video';
export type CallRoomType = 'private' | 'group';

/** Serializable subset of RTCIceServer (kept free of DOM types for redux). */
export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const ICE_URL_RE = /^(stun|stuns|turn|turns):/i;

/**
 * Accepts an array, an `{ iceServers }` envelope or a JSON string of either
 * (the call-token stanza carries the list as a JSON attribute) and returns
 * only well formed stun/turn entries. Anything else is dropped, never thrown.
 */
export const normalizeIceServers = (raw: unknown): IceServerConfig[] => {
  let value: unknown = raw;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    try {
      value = JSON.parse(text);
    } catch {
      return [];
    }
  }
  if (
    value &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    Array.isArray((value as { iceServers?: unknown }).iceServers)
  ) {
    value = (value as { iceServers: unknown[] }).iceServers;
  }
  if (!Array.isArray(value)) return [];

  const out: IceServerConfig[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const rawUrls = e.urls ?? e.url;
    const candidates: unknown[] = Array.isArray(rawUrls) ? rawUrls : [rawUrls];
    const list = candidates
      .filter((u): u is string => typeof u === 'string')
      .map((u) => u.trim())
      .filter((u) => ICE_URL_RE.test(u));
    if (list.length === 0) continue;
    const server: IceServerConfig = {
      urls: typeof rawUrls === 'string' ? list[0] : list,
    };
    if (typeof e.username === 'string' && e.username) {
      server.username = e.username;
    }
    if (typeof e.credential === 'string' && e.credential) {
      server.credential = e.credential;
    }
    out.push(server);
  }
  return out;
};

/**
 * A LiveKit server URL as the backend publishes it. Only websocket / http(s)
 * URLs are accepted: the value ends up as the connect target of the media
 * session, so anything else (javascript:, data:, garbage) is treated as unset.
 */
export const normalizeLivekitUrl = (raw: unknown): string | null => {
  const text = typeof raw === 'string' ? raw.trim() : '';
  return /^(wss?|https?):\/\/[^\s]+$/i.test(text) ? text : null;
};

const isTrueish = (value: unknown): boolean => {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  return text === 'true' || text === '1';
};

/** Attributes of a `<data type="call-token">` element, defensively read. */
export interface ParsedCallTokenAttrs {
  token: string;
  room: string;
  /** Raw `callId` attribute, null when absent (the JWT may still carry it). */
  callId: string | null;
  /** Valid `kind` attribute, null when absent or unrecognised. */
  kind: CallKindName | null;
  mode: CallMode;
  group: boolean;
  /** Callee's ICE servers for `mode=p2p`, null when absent or unparseable. */
  iceServers: IceServerConfig[] | null;
  /**
   * Public LiveKit wss URL for `mode=livekit`, null when the server did not
   * send one (older backends), it is empty, or it is not a usable URL.
   */
  livekitUrl: string | null;
  /**
   * Caller's display name as plain text (control characters stripped, capped,
   * raw chat names refused); '' when absent. Only trustworthy from the system
   * account, see calls/senderTrust.
   */
  callerName: string;
  /** Caller's xmppUsername when well formed, else null. Same trust rule. */
  caller: string | null;
}

/**
 * Tolerant reader for the call-token stanza. A server that sends neither
 * `mode` nor `group` (every server before P2P / group calls) yields
 * `mode: 'livekit'`, `group: false`, i.e. exactly the legacy behaviour.
 */
export const parseCallTokenAttrs = (
  attrs: Record<string, any> | undefined | null
): ParsedCallTokenAttrs => {
  const a = attrs || {};
  const kindRaw = String(a.kind || '')
    .trim()
    .toLowerCase();
  const mode: CallMode =
    String(a.mode || '')
      .trim()
      .toLowerCase() === 'p2p'
      ? 'p2p'
      : 'livekit';
  const iceList = mode === 'p2p' ? normalizeIceServers(a.ice) : [];
  return {
    token: String(a.token || '').trim(),
    room: String(a.room || '').trim(),
    callId: String(a.callId || a.callid || '').trim() || null,
    kind: kindRaw === 'audio' || kindRaw === 'video' ? kindRaw : null,
    mode,
    // A p2p call is 1:1 by construction; never let a stray attribute flip it.
    group: mode === 'livekit' && isTrueish(a.group),
    iceServers: mode === 'p2p' && iceList.length > 0 ? iceList : null,
    livekitUrl: mode === 'livekit' ? normalizeLivekitUrl(a.livekitUrl) : null,
    callerName: sanitizeCallName(a.callerName),
    caller: sanitizeXmppUsername(a.caller),
  };
};

/** Normalised `POST /v1/chats/call/create/:chatName` response. */
export interface CallCreateResult {
  callId: string | null;
  mode: CallMode;
  kind: CallKindName;
  /** Server-reported group flag, null when the server did not say. */
  group: boolean | null;
  /** Public LiveKit wss URL when the server knows it. */
  livekitUrl: string | null;
  iceServers: IceServerConfig[];
  ttlSeconds: number | null;
}

/**
 * Reads the create response. Old servers answer with no `mode`, which maps to
 * `livekit` (the caller then waits for its own call-token as before). A p2p
 * answer without a callId is unusable (no way to correlate signalling) and
 * throws.
 */
export const parseCallCreateResponse = (
  data: unknown,
  fallbackKind: CallKindName
): CallCreateResult => {
  const root = (data && typeof data === 'object' ? data : {}) as Record<
    string,
    any
  >;
  const d =
    root.result && typeof root.result === 'object' && !root.mode
      ? (root.result as Record<string, any>)
      : root;
  const mode: CallMode =
    String(d.mode || '')
      .trim()
      .toLowerCase() === 'p2p'
      ? 'p2p'
      : 'livekit';
  const kindRaw = String(d.kind || '')
    .trim()
    .toLowerCase();
  const callId = String(d.callId || d.callid || '').trim() || null;
  if (mode === 'p2p' && !callId) {
    throw new Error('Call response is missing callId');
  }
  const ttl = Number(d.ttlSeconds);
  const livekitUrl = normalizeLivekitUrl(d.livekitUrl);
  return {
    callId,
    mode,
    kind:
      kindRaw === 'audio' || kindRaw === 'video'
        ? (kindRaw as CallKindName)
        : fallbackKind,
    group: typeof d.group === 'boolean' ? d.group : null,
    livekitUrl,
    iceServers: mode === 'p2p' ? normalizeIceServers(d.iceServers) : [],
    ttlSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : null,
  };
};

/**
 * Which room types may start / receive calls. Hosts that never set
 * `allowedRoomTypes` get 1:1 and group chats; an explicit list is respected
 * as written (so `['private']` keeps a host on 1:1 only).
 */
export const DEFAULT_CALL_ROOM_TYPES: CallRoomType[] = ['private', 'group'];

export const isCallRoomTypeAllowed = (
  roomType: string | undefined | null,
  allowedRoomTypes?: CallRoomType[] | null
): boolean => {
  if (roomType !== 'private' && roomType !== 'group') return false;
  const allowed = allowedRoomTypes || DEFAULT_CALL_ROOM_TYPES;
  return allowed.includes(roomType);
};

export interface BusyCallSnapshot {
  phase: string;
  direction: 'incoming' | 'outgoing' | null;
  mode: CallMode;
  callId: string | null;
  roomBareName: string | null;
}

/**
 * What to do with an incoming call-token while another call may be active.
 *  - accept:      nothing active, ring.
 *  - duplicate:   same callId as the active call (server re-delivery), ignore.
 *  - replace:     legacy LiveKit behaviour (a new token overwrites the old
 *                 call), kept exactly for livekit-vs-livekit.
 *  - glare-yield: both sides dialled each other; the lexicographically smaller
 *                 callId wins on BOTH ends, and this is the loser: drop our
 *                 outgoing call and ring for theirs.
 *  - glare-keep:  same race, we hold the winning callId, ignore theirs (the
 *                 other side yields).
 *  - busy:        a different call is in progress, decline the newcomer.
 */
export type IncomingWhileBusyDecision =
  | 'accept'
  | 'duplicate'
  | 'replace'
  | 'glare-yield'
  | 'glare-keep'
  | 'busy';

export const decideIncomingWhileBusy = (
  current: BusyCallSnapshot,
  incoming: {
    mode: CallMode;
    callId: string | null;
    roomBareName: string | null;
  }
): IncomingWhileBusyDecision => {
  if (current.phase === 'idle') return 'accept';
  if (incoming.callId && current.callId === incoming.callId) return 'duplicate';
  if (current.mode !== 'p2p' && incoming.mode !== 'p2p') return 'replace';

  const sameRoom =
    !!incoming.roomBareName && current.roomBareName === incoming.roomBareName;
  if (
    sameRoom &&
    current.direction === 'outgoing' &&
    current.phase === 'requesting' &&
    incoming.mode === 'p2p' &&
    current.mode === 'p2p' &&
    current.callId &&
    incoming.callId
  ) {
    return incoming.callId < current.callId ? 'glare-yield' : 'glare-keep';
  }
  return 'busy';
};
