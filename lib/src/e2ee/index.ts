// Glue between the OMEMO implementation and the rest of the SDK.
//
// Everything here is inert unless the host app turns encryption on
// (`config.e2ee.enabled`) AND the room itself is marked `e2ee` by the
// backend. With the flag off, `omemoFor()` returns undefined and both seams
// - sendTextMessage and handleStanza - take exactly the byte-for-byte path
// they took before this module existed.

import type { Client } from '@xmpp/client';
import { store } from '../roomStore';
import { Omemo } from './omemo';
import { openIndexedDbStore } from './store';

export { NS_OMEMO, FALLBACK_BODY, formatFingerprint } from './omemo';
export type { Decrypted, DeviceInfo, Trust } from './omemo';
export { Omemo } from './omemo';

let enabled = false;
let instance: Omemo | undefined;
/** Guards against two `online` events racing to build the same device. */
let starting: Promise<Omemo | undefined> | undefined;
/** The connected client, kept so enabling after connect still starts OMEMO. */
let live: Client | undefined;

/**
 * Set from IConfig when the chat mounts.
 *
 * The config effect and the XMPP `online` event race, and either order is
 * normal, so both this and onOnline() end in the same maybeStart().
 */
export function setE2eeEnabled(value: boolean): void {
  if (enabled === value) return;
  enabled = value;
  if (!enabled) stopOmemo();
  else void maybeStart();
}

export function isE2eeEnabled(): boolean {
  return enabled;
}

/** Called once the XMPP session is up. */
export function onOnline(client: Client): void {
  live = client;
  void maybeStart();
}

/**
 * Creates this device's keys and publishes them. Safe to call on every
 * reconnect: existing keys are loaded from IndexedDB, and the bundle is
 * republished so prekeys stay fresh.
 */
function maybeStart(): Promise<Omemo | undefined> {
  const client = live;
  if (!enabled || !client) return Promise.resolve(undefined);
  const jid = client.jid?.bare?.().toString()?.toLowerCase();
  if (!jid) return Promise.resolve(undefined);
  if (instance && instance.jid === jid) return Promise.resolve(instance);
  if (starting) return starting;

  starting = (async () => {
    try {
      const keyStore = await openIndexedDbStore(jid);
      instance = await Omemo.create(client, jid, keyStore);
      return instance;
    } catch (err) {
      // A failure here must not take the chat down with it: plain rooms keep
      // working, and in encrypted ones the send seam falls back to plaintext
      // (see sendTextMessage) - the message still goes out, and the receiving
      // side marks it unprotected because it arrived outside an OMEMO payload.
      console.error('OMEMO: could not start', err);
      return undefined;
    } finally {
      starting = undefined;
    }
  })();
  return starting;
}

/** Drops the in-memory instance. Stored keys survive, so a re-login resumes. */
export function stopOmemo(): void {
  instance = undefined;
  starting = undefined;
  live = undefined;
}

/** The live instance, or undefined when encryption is off / not ready. */
export function omemo(): Omemo | undefined {
  return enabled ? instance : undefined;
}

/**
 * The instance once it is usable, rather than whatever exists right now.
 *
 * Publishing this device's bundle takes a round trip, and the server starts
 * pushing archived messages the moment we join a room - so the first page of
 * history routinely arrives while OMEMO is still starting. Reading `omemo()`
 * there returns undefined and those messages get permanently rendered as
 * undecryptable, even though the keys to read them land a moment later.
 * Awaiting this instead makes the seam wait out that window.
 */
export function omemoReady(): Promise<Omemo | undefined> {
  if (!enabled) return Promise.resolve(undefined);
  if (instance) return Promise.resolve(instance);
  return starting ?? maybeStart();
}

/** True when the backend marked this room as end-to-end encrypted. */
export function isE2eeRoom(roomJid: string): boolean {
  if (!enabled || !roomJid) return false;
  const jid = roomJid.split('/')[0];
  return Boolean(store.getState()?.rooms?.rooms?.[jid]?.e2ee);
}

/**
 * Bare JIDs to encrypt for: every member of the room.
 *
 * The member list comes from `GET /v1/chats/my` (RoomMember.xmppUsername), so
 * it is the backend's view of who belongs to the room, not the list of who
 * happens to be joined right now. That is what we want - somebody offline
 * still has to be able to read the message later.
 */
export function roomRecipients(roomJid: string, domain: string): string[] {
  const jid = roomJid.split('/')[0];
  const members = store.getState()?.rooms?.rooms?.[jid]?.members ?? [];
  return members
    .map((m) => String(m?.xmppUsername || '').split('@')[0])
    .filter(Boolean)
    .map((local) => `${local}@${domain}`.toLowerCase());
}

/**
 * The real bare JID behind a MUC `from`.
 *
 * `room@conference.host/nick` -> `nick@host`. This works because the SDK
 * always joins with `client.jid.getLocal()` as the nick (presenceInRoom and
 * createRoomPresence), so the nick IS the account's localpart. It is also why
 * OMEMO works here without making rooms non-anonymous: we never need the MUC
 * to disclose real JIDs.
 */
export function senderJidFromMuc(
  from: string | undefined,
  domain: string
): string | undefined {
  const nick = String(from || '').split('/')[1];
  if (!nick || !domain) return undefined;
  return `${nick}@${domain}`.toLowerCase();
}

/** Account domain taken from our own JID, e.g. "dappros.com". */
export function accountDomain(client: Client | undefined): string {
  return String(client?.jid?.getDomain?.() || '').toLowerCase();
}
