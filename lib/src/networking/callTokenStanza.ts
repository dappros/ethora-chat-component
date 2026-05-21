import { Element } from 'ltx';
import { xml } from '@xmpp/client';
import { store } from '../roomStore';
import {
  endCall,
  setCallKind,
  setIncomingCallToken,
  setOutgoingCallToken,
} from '../roomStore/callSlice';
import { getGlobalXmppClient } from '../utils/clientRegistry';

// Backend currently doesn't propagate `kind` on the broadcast call-token
// stanza — both ends default to video unless we tell them otherwise. We
// work around it by having the dialer send a separate `<data type=
// "call-invite" kind="..." ... />` direct-chat to the peer right before
// POST /v1/chats/call/create. The invite arrives over ~50ms direct chat,
// the call-token relays through the server in ~200-300ms, so the invite
// almost always lands first. This stash keys the kind hint by callId AND
// by room bare name (server sometimes drops callId on the token).
//
// TTL keeps the map from growing unbounded if a token never arrives.
const KIND_HINT_TTL_MS = 60_000;
const kindHints = new Map<
  string,
  { kind: 'audio' | 'video'; expiresAt: number }
>();

const stashKindHint = (
  key: string | null | undefined,
  kind: 'audio' | 'video'
) => {
  if (!key) return;
  // Cheap cleanup pass — drop expired entries before inserting.
  const now = Date.now();
  for (const [k, v] of kindHints) {
    if (v.expiresAt < now) kindHints.delete(k);
  }
  kindHints.set(key, { kind, expiresAt: now + KIND_HINT_TTL_MS });
};

const consumeKindHint = (
  keys: Array<string | null | undefined>
): 'audio' | 'video' | null => {
  const now = Date.now();
  for (const key of keys) {
    if (!key) continue;
    const hit = kindHints.get(key);
    if (hit && hit.expiresAt >= now) {
      kindHints.delete(key);
      return hit.kind;
    }
  }
  return null;
};

const MAX_CALL_TOKEN_AGE_MS = 5000;

// Pull the JWT payload out of the call-token. We only read non-sensitive
// claims (`sub` = caller display name; `metadata.callId`, `video.room`) —
// no signature verification, which is fine because the server has already
// vetted the token and LiveKit will reject anything tampered with on
// connect. Returns null when the token isn't a parseable JWT.
const decodeJwtPayload = (token: string): Record<string, any> | null => {
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
    return JSON.parse(decoded) as Record<string, any>;
  } catch {
    return null;
  }
};

const extractCallId = (data: Element, jwtPayload: Record<string, any> | null) => {
  const fromAttr = String(data.attrs?.callId || data.attrs?.callid || '').trim();
  if (fromAttr) return fromAttr;
  const metadata = jwtPayload?.metadata;
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      if (parsed?.callId) return String(parsed.callId);
    } catch {
      // metadata isn't JSON — ignore
    }
  } else if (metadata && typeof metadata === 'object' && metadata.callId) {
    return String(metadata.callId);
  }
  return null;
};

const extractCallerDisplayName = (
  jwtPayload: Record<string, any> | null
): string => {
  const sub = jwtPayload?.sub;
  if (typeof sub !== 'string') return '';
  const trimmed = sub.trim();
  if (!trimmed) return '';
  // Defense: server occasionally falls back to xmppUsername / userId for
  // `sub` when the caller's profile is incomplete. Those look like raw
  // ID strings (long, no spaces, all alphanumeric with underscores). Skip
  // them so we don't render an opaque ID as the "caller name".
  const looksLikeRawId = /^[0-9a-f_-]{16,}$/i.test(trimmed);
  if (looksLikeRawId) return '';
  return trimmed;
};

// Room name format is "<userA>-<userB>" for 1:1 private chats (post
// /chats/private convention). Derive the peer xmpp localpart by removing
// the current user's xmpp localpart from the split.
const derivePeerXmppUsername = (
  bareRoomName: string,
  selfXmppUsername: string
): string | null => {
  if (!bareRoomName.includes('-')) return null;
  const parts = bareRoomName.split('-');
  if (parts.length !== 2) return null;
  const selfLocal = String(selfXmppUsername || '').split('@')[0];
  const peer = parts.find((p) => p && p !== selfLocal);
  return peer || null;
};

// Body-text values the server may use to broadcast call signaling into a
// MUC room (so other clients without `<data>` parsing still receive the
// event in their MAM archive). These must NEVER reach `onRealtimeMessage`
// or they render as chat bubbles / new-message notifications saying
// "Deleted User: call-state".
const CALL_BODY_KEYWORDS = new Set([
  'call-token',
  'call-state',
  'call-ringing',
  'call-ended',
  'call-declined',
  'call-cancelled',
  'call-canceled',
  'call-timeout',
  'call-rejected',
]);

const extractNumericTimestamp = (value?: string): number | null => {
  const source = String(value || '').trim();
  if (!source) return null;

  const direct = Number(source);
  if (Number.isFinite(direct) && direct > 0) {
    return source.length > 13 ? Number(source.slice(0, 13)) : direct;
  }

  const match = source.match(/\d{13,}/)?.[0];
  if (!match) return null;
  return Number(match.slice(0, 13));
};

const isFreshCallToken = (stanza: Element): boolean => {
  const stanzaId = stanza.getChild('stanza-id')?.attrs?.id;
  const createdTs = extractNumericTimestamp(stanzaId);
  if (!createdTs) return false;
  return Math.abs(Date.now() - createdTs) <= MAX_CALL_TOKEN_AGE_MS;
};

// Match a call-token stanza's `room` attribute against the local rooms map.
// The server sends the bare room name (e.g. "${appId}_<uuid>"), but our
// store keys rooms by full JID, and IRoom.name actually holds the display
// title (see createRoomFromApi — the API's `name` is mapped onto the JID
// localpart). So lookup order is: full JID match → JID-localpart match →
// last-resort display-title match (only useful when the server ever decides
// to send a fully-qualified JID or a title verbatim).
const resolveRoomByStanzaRoom = (roomAttr: string) => {
  const rooms = (store.getState().rooms.rooms || {}) as Record<
    string,
    { jid?: string; name?: string; type?: string; usersCnt?: number }
  >;
  const roomEntries = Object.values(rooms);

  const byJid = rooms[roomAttr];
  if (byJid) return byJid;

  const byLocalpart = roomEntries.find(
    (room) => (room?.jid || '').split('@')[0] === roomAttr
  );
  if (byLocalpart) return byLocalpart;

  const byName = roomEntries.find((room) => room?.name === roomAttr);
  if (byName) return byName;

  return null;
};

// Mirror of handleStanzas.unwrapMucsubMessage so we can look at the real
// payload that the server pushed into the room — mucsub wraps the inner
// <message> inside <event><items><item>.
const unwrapMucsub = (stanza: Element): Element => {
  const inner = stanza
    ?.getChild?.('event', 'http://jabber.org/protocol/pubsub#event')
    ?.getChild?.('items')
    ?.getChild?.('item')
    ?.getChild?.('message');
  return (inner as Element) || stanza;
};

const findCallData = (stanza: Element): Element | null => {
  // Direct `<data type="call-*">` on the message.
  const direct = stanza.getChild('data');
  if (direct && /^call-/i.test(String(direct.attrs?.type || ''))) {
    return direct;
  }
  return null;
};

const getBodyText = (stanza: Element): string => {
  const body = stanza.getChild('body');
  return String(body?.getText?.() || '').trim();
};

const handleCallStateData = (
  data: Element,
  fallbackRoomAttr?: string
): void => {
  const state = String(data.attrs?.state || data.attrs?.event || '').toLowerCase();
  const stanzaRoomAttr =
    String(data.attrs?.room || '').trim() || (fallbackRoomAttr || '');
  const currentCall = store.getState().call;

  const matchesActive =
    !stanzaRoomAttr ||
    currentCall.roomJid === stanzaRoomAttr ||
    currentCall.roomName === stanzaRoomAttr ||
    (currentCall.roomJid || '').split('@')[0] === stanzaRoomAttr;

  if (!matchesActive) return;

  // 'ringing' is informational — the dial UI already shows "Calling…"
  // during the 'requesting' window. Terminal transitions tear the call
  // down so neither side is stuck staring at a phantom modal.
  if (
    state === 'ended' ||
    state === 'declined' ||
    state === 'cancelled' ||
    state === 'canceled' ||
    state === 'timeout' ||
    state === 'rejected'
  ) {
    store.dispatch(endCall());
  }
};

export const onCallTokenMessage = (stanza: Element): boolean => {
  if (!stanza?.is('message')) {
    return false;
  }

  // 1. Unwrap mucsub wrappers so server broadcasts into the MUC archive
  //    are inspected the same way as direct chat stanzas.
  const inner = unwrapMucsub(stanza);

  // 2. Anything carrying a `<data type="call-*">` element is signaling, no
  //    matter the message type (chat / groupchat / headline) — swallow it
  //    before any chat / history / notification handler touches it.
  const data = findCallData(inner);
  if (data) {
    const dataType = String(data.attrs?.type || '').toLowerCase();

    if (dataType === 'call-state') {
      handleCallStateData(inner);
      return true;
    }

    if (dataType === 'call-invite') {
      const inviteKind = String(data.attrs?.kind || '').toLowerCase();
      const normalized: 'audio' | 'video' =
        inviteKind === 'audio' ? 'audio' : 'video';
      const inviteRoom = String(data.attrs?.room || '').trim() || null;
      const inviteCallId =
        String(data.attrs?.callId || data.attrs?.callid || '').trim() || null;

      // Stash for the upcoming call-token lookup AND patch any existing
      // call state if the token actually arrived first (rare race).
      stashKindHint(inviteRoom, normalized);
      stashKindHint(inviteCallId, normalized);

      const currentCall = store.getState().call;
      const matchesActive =
        currentCall.phase !== 'idle' &&
        ((!!inviteRoom &&
          (currentCall.roomBareName === inviteRoom ||
            currentCall.roomJid === inviteRoom ||
            (currentCall.roomJid || '').split('@')[0] === inviteRoom)) ||
          (!!inviteCallId && currentCall.callId === inviteCallId));
      if (matchesActive && currentCall.kind !== normalized) {
        store.dispatch(setCallKind(normalized));
      }
      return true;
    }

    if (dataType === 'call-token') {
      const videoCallsConfig =
        store.getState().chatSettingStore.config?.videoCalls;
      if (videoCallsConfig?.enabled !== true) {
        return true;
      }
      if (!isFreshCallToken(inner)) {
        return true;
      }

      const token = String(data.attrs?.token || '').trim();
      const stanzaRoom = String(data.attrs?.room || '').trim();
      const stanzaKind = String(data.attrs?.kind || '').toLowerCase();
      const stanzaCallId =
        String(data.attrs?.callId || data.attrs?.callid || '').trim() || null;
      // Server doesn't propagate `kind` on the broadcast stanza, so first
      // look for a client-side `call-invite` hint we stashed when the
      // dialer signaled us directly. Falls back to whatever the server
      // happens to attach, finally to video (legacy default).
      const hintedKind = consumeKindHint([stanzaRoom, stanzaCallId]);
      const kind: 'audio' | 'video' =
        hintedKind || (stanzaKind === 'audio' ? 'audio' : 'video');
      if (!token || !stanzaRoom) {
        return true;
      }

      const resolvedRoom = resolveRoomByStanzaRoom(stanzaRoom);
      const allowedRoomTypes = videoCallsConfig.allowedRoomTypes || ['private'];
      const usersCnt = Number(resolvedRoom?.usersCnt || 0);
      const isOneToOneLikeRoom = usersCnt > 0 && usersCnt <= 2;
      const isPrivateAllowed = allowedRoomTypes.includes('private');
      if (
        resolvedRoom?.type &&
        resolvedRoom.type !== 'private' &&
        !isOneToOneLikeRoom
      ) {
        return true;
      }
      if (resolvedRoom?.type === 'private' && !isPrivateAllowed) {
        return true;
      }
      if (
        !resolvedRoom?.type &&
        !stanzaRoom.includes('@') &&
        !isOneToOneLikeRoom
      ) {
        return true;
      }

      const roomJid =
        resolvedRoom?.jid || (stanzaRoom.includes('@') ? stanzaRoom : '');
      // Prefer the JWT `sub` claim as the display name on the incoming
      // ring screen — the server populates it with the caller's full name
      // ("Roman Test") which is far more useful than the resolved room
      // title (which for stale / deleted-peer chats reads "deleted").
      const jwtPayload = decodeJwtPayload(token);
      const callerName = extractCallerDisplayName(jwtPayload);
      const resolvedTitle = String(resolvedRoom?.name || '').trim();
      const titleLooksBad =
        !resolvedTitle ||
        ['deleted', 'deleted user', 'unknown', 'null'].includes(
          resolvedTitle.toLowerCase()
        );
      const incomingRoomName =
        (callerName && titleLooksBad ? callerName : resolvedTitle) ||
        callerName ||
        stanzaRoom;
      if (!roomJid) return true;

      const callId = extractCallId(data, jwtPayload);
      const selfXmpp =
        store.getState().chatSettingStore.user?.xmppUsername || '';
      const peerXmppUsername = derivePeerXmppUsername(stanzaRoom, selfXmpp);

      const callState = store.getState().call;
      const isOutgoingRoomMatch =
        callState.direction === 'outgoing' &&
        (callState.roomJid === roomJid ||
          callState.roomName === incomingRoomName ||
          callState.roomBareName === stanzaRoom);

      if (isOutgoingRoomMatch) {
        store.dispatch(
          setOutgoingCallToken({ roomJid, token, callId: callId || null })
        );
        return true;
      }

      store.dispatch(
        setIncomingCallToken({
          roomJid,
          roomName: incomingRoomName,
          roomBareName: stanzaRoom,
          token,
          kind,
          callId: callId || null,
          peerXmppUsername: peerXmppUsername || null,
        })
      );
      return true;
    }

    // Unknown `call-*` signaling — swallow so it never lands in chat.
    return true;
  }

  // 3. Backstop for legacy servers / clients that broadcast the signal as
  //    plain body text (no `<data>` element). The body literally reads
  //    "call-state" / "call-token" / etc. — drop these so the chat list
  //    and the notification toast never display them.
  const bodyText = getBodyText(inner).toLowerCase();
  if (bodyText && CALL_BODY_KEYWORDS.has(bodyText)) {
    if (bodyText.startsWith('call-')) {
      const stateFromBody = bodyText.replace(/^call-/, '');
      // Treat the body-only variant as a state notification; tear down
      // active call on terminal transitions, ignore otherwise.
      handleCallStateData(
        ({
          attrs: { state: stateFromBody, room: '' },
        } as unknown) as Element
      );
    }
    return true;
  }

  return false;
};

// Outbound counterpart of the swallow logic above. When the local user
// hangs up, cancels their own dial, or declines an incoming ring we send
// a `call-state` stanza to the peer so their UI dismisses instead of
// dangling on a phantom "incoming call" or "calling…" screen.
//
// We address the peer directly (`<message type="chat" to="<peer>@<host>">`)
// — going through the room JID isn't reliable because the callee may not
// have joined the MUC yet during the ring window. The receiving client's
// onCallTokenMessage handler picks up the same `<data type="call-state">`
// it would receive from the server and dispatches `endCall()`.
export type CallSignalState =
  | 'ended'
  | 'declined'
  | 'cancelled'
  | 'rejected';

export const sendCallStateSignal = (
  state: CallSignalState,
  options?: {
    peerXmppUsername?: string | null;
    callId?: string | null;
    roomBareName?: string | null;
  }
): void => {
  const xmppClient = getGlobalXmppClient();
  if (!xmppClient) return;

  const callState = store.getState().call;
  const peer = (options?.peerXmppUsername || callState.peerXmppUsername || '').trim();
  if (!peer) return;

  const host = (xmppClient as any).host || '';
  if (!host) return;

  const callId = options?.callId || callState.callId || '';
  const room =
    options?.roomBareName ||
    callState.roomBareName ||
    (callState.roomJid || '').split('@')[0] ||
    '';

  try {
    const stanza = xml(
      'message',
      {
        to: peer.includes('@') ? peer : `${peer}@${host}`,
        type: 'chat',
        id: `call-state-${Date.now()}`,
      },
      xml('data', {
        type: 'call-state',
        state,
        callId,
        room,
      })
    );
    (xmppClient as any).client?.send?.(stanza);
  } catch {
    // Swallow — signaling is best-effort. The LiveKit room disconnect
    // also serves as an implicit "call ended" once both sides are in.
  }
};

// Tell the peer what KIND of call we're starting before the server-side
// call-token stanza reaches them — the backend currently drops the kind
// attribute on its broadcast, so without this the callee always lands on
// the video UI even when the dialer chose audio.
//
// Sent right before POST /v1/chats/call/create, addressed directly to
// the peer's bare JID. Receiver swallows it via onCallTokenMessage and
// stashes the kind hint for the upcoming call-token lookup.
export const sendCallInviteSignal = (
  kind: 'audio' | 'video',
  options: {
    peerXmppUsername: string;
    roomBareName: string;
    callId?: string | null;
  }
): void => {
  const xmppClient = getGlobalXmppClient();
  if (!xmppClient) return;
  const peer = String(options.peerXmppUsername || '').trim();
  if (!peer) return;
  const host = (xmppClient as any).host || '';
  if (!host) return;

  try {
    const stanza = xml(
      'message',
      {
        to: peer.includes('@') ? peer : `${peer}@${host}`,
        type: 'chat',
        id: `call-invite-${Date.now()}`,
      },
      xml('data', {
        type: 'call-invite',
        kind,
        room: options.roomBareName || '',
        callId: options.callId || '',
      })
    );
    (xmppClient as any).client?.send?.(stanza);
  } catch {
    // Best-effort: missing the hint just means the callee starts on the
    // video UI and the dialer's audio publish auto-corrects once both
    // join LiveKit (UI flicker, not a functional failure).
  }
};
