import type { Element } from 'ltx';
import type { IRoom } from '../types/types';
import type { PeerStatus } from '../roomStore/trustSafetySlice';
import { toLocalPart } from './xmppIdShape';

/**
 * Suspended accounts as other people see them (Trust & Safety section 16).
 *
 * Pure helpers: no store, no network. The lookup service that uses them is
 * networking/suspendedPeersLookup.ts; the state lives in
 * trustSafetySlice.peers.
 */

/** A status answer is trusted for this long, then asked again. */
export const SUSPENDED_STATUS_TTL_MS = 5 * 60 * 1000;

/** The status endpoint takes at most this many names per call. */
export const SUSPENDED_STATUS_MAX_BATCH = 500;

/** The child the chat server puts in the <error> of a bounced message. */
export const MODERATION_XMLNS = 'urn:ethora:moderation';

/** The API error code for a refusal aimed at a suspended account. */
export const PEER_SUSPENDED = 'PEER_SUSPENDED';

/** Thrown by API helpers when the server answered 409 PEER_SUSPENDED. */
export class PeerSuspendedError extends Error {
  readonly code = PEER_SUSPENDED;

  constructor(message = 'This account is suspended') {
    super(message);
    this.name = 'PeerSuspendedError';
  }
}

export const isPeerSuspendedError = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === PEER_SUSPENDED;

/** Why a sent message is shown as failed for good (no retry offered). */
export const PEER_SUSPENDED_FAILURE = 'peer-suspended';

/**
 * The store key for an account: the local part of its JID, i.e. its
 * xmppUsername. Accepts a bare xmppUsername, a bare JID or a full JID.
 */
export const toPeerKey = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return toLocalPart(value.trim()).split('/')[0].trim();
};

/**
 * The other person in a 1:1 room: the member whose xmppUsername is not
 * ours. Same rule the room list, the chat header and the chat profile use.
 * Empty for group rooms and for a private room whose members are not known.
 */
export const getPrivatePeerXmppUsername = (
  room: Pick<IRoom, 'type' | 'members'> | null | undefined,
  myXmppUsername: string | null | undefined
): string => {
  if (!room || room.type !== 'private') return '';
  const me = toPeerKey(myXmppUsername || '');
  const members = Array.isArray(room.members) ? room.members : [];
  for (const member of members) {
    const key = toPeerKey(member?.xmppUsername);
    if (key && key !== me) return key;
  }
  return '';
};

/**
 * Who the client should know about: the partner of every private chat in
 * the room list, plus the members and message senders of the open room.
 * Our own account is left out. Unique, in a stable order.
 */
export const collectSuspendedLookupTargets = (
  rooms: Record<string, IRoom> | null | undefined,
  activeRoomJID: string | null | undefined,
  myXmppUsername: string | null | undefined
): string[] => {
  const me = toPeerKey(myXmppUsername || '');
  const out = new Set<string>();
  const add = (value: unknown) => {
    const key = toPeerKey(value);
    if (key && key !== me) out.add(key);
  };

  for (const room of Object.values(rooms || {})) {
    const peer = getPrivatePeerXmppUsername(room, me);
    if (peer) out.add(peer);
  }

  const active = activeRoomJID ? rooms?.[activeRoomJID] : undefined;
  if (active) {
    for (const member of Array.isArray(active.members) ? active.members : []) {
      add(member?.xmppUsername);
    }
    for (const message of Array.isArray(active.messages)
      ? active.messages
      : []) {
      // System lines and a masked sender (already shown as "Suspended
      // account") need no lookup.
      if (
        !message ||
        message.isSystemMessage === 'true' ||
        message.senderMasked
      ) {
        continue;
      }
      add(message.user?.id);
    }
  }
  return [...out];
};

/** The keys with no answer yet, or with one older than `ttlMs`. */
export const selectStalePeerKeys = (
  keys: string[],
  statuses: Record<string, PeerStatus> | undefined,
  now: number,
  ttlMs: number = SUSPENDED_STATUS_TTL_MS
): string[] =>
  keys.filter((key) => {
    const status = statuses?.[key];
    return !status || now - status.checkedAt >= ttlMs;
  });

export const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  if (size <= 0) return out;
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

/**
 * The bounce the chat server sends for a 1:1 message or a call signal
 * addressed to a suspended (banned) account:
 *
 *   <message type='error' from='<recipient>' id='<same id>'>
 *     <error type='cancel'>
 *       <not-acceptable xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'/>
 *       <text xmlns='urn:ietf:params:xml:ns:xmpp-stanzas'>Recipient account is suspended</text>
 *       <suspended xmlns='urn:ethora:moderation'/>
 *     </error>
 *   </message>
 *
 * Only the `<suspended/>` child counts; the text is for humans.
 */
export const isPeerSuspendedBounce = (
  stanza: Element | null | undefined
): boolean => {
  if (!stanza || stanza.name !== 'message' || stanza.attrs?.type !== 'error') {
    return false;
  }
  const error = stanza.getChild?.('error');
  if (!error) return false;
  return Boolean(error.getChild('suspended', MODERATION_XMLNS));
};

/**
 * The xmppUsernames named by a PEER_SUSPENDED refusal or by a bulk add's
 * per-member results (`[{ xmppUsername | username, code }]`).
 */
export const peerSuspendedTargetsFromResults = (results: unknown): string[] => {
  if (!Array.isArray(results)) return [];
  const out: string[] = [];
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const error =
      record.error && typeof record.error === 'object'
        ? (record.error as Record<string, unknown>)
        : undefined;
    const code = String(record.code ?? error?.code ?? '');
    if (code !== PEER_SUSPENDED) continue;
    const key = toPeerKey(
      record.xmppUsername ?? record.username ?? record.member ?? record.jid
    );
    if (key) out.push(key);
  }
  return out;
};
