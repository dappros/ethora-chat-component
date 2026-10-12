// End-to-end encryption key exchange for LiveKit calls.
//
// LiveKit's E2EE encrypts the media with a symmetric key that the client
// supplies (ExternalE2EEKeyProvider) - the SFU only forwards the already
// encrypted frames, so it can never read them. The one thing LiveKit does not
// do is get that key to the other participants; whoever relays it (here, the
// XMPP server) would otherwise see it and the call would no longer be
// end-to-end.
//
// So the key rides the SAME OMEMO channel the chat uses: it is encrypted to
// every room member's devices and sent as an ephemeral signal (see
// Omemo.sendGroupSignal). The server observes ciphertext only, so the media
// key - and therefore the call - stays private even from the operator, with
// exactly the trust model OMEMO already gives the chat (blind-trust-before-
// verification on device fingerprints).

import { xml } from '@xmpp/client';
import { Element } from 'ltx';
import { randomBytes, toBase64 } from './crypto';
import { isE2eeEnabled, isE2eeRoom, omemoReady, roomRecipients } from './index';

/** Namespace of the <call-key> signal element carried inside the SCE envelope. */
export const NS_CALL_E2EE = 'ethora:call:e2ee:0';

/**
 * A fresh 256-bit media key for one call, as a base64 string. A new key per
 * call gives forward secrecy between calls: a key recovered from one call
 * cannot open the next. The string is fed verbatim to both peers'
 * `ExternalE2EEKeyProvider.setKey`, which HKDFs it into the frame key.
 */
export function generateCallKey(): string {
  return toBase64(randomBytes(32));
}

function domainOf(jid: string): string {
  return jid.split('@')[1] || '';
}

/** The <call-key> element that rides inside the OMEMO SCE envelope. */
export function callKeyElement(callId: string, key: string): Element {
  return xml('call-key', { xmlns: NS_CALL_E2EE, callId, key });
}

/**
 * Hands `key` to every member of `roomJid`, end-to-end encrypted via OMEMO so
 * the server never sees it.
 *
 * Returns false (a no-op) unless E2EE is enabled for the app AND the backend
 * marked the room `e2ee`, or when no member has published an OMEMO device yet
 * (in which case the caller falls back to a non-E2EE call rather than
 * failing). Returns true once the encrypted key is on its way to at least one
 * recipient device.
 */
export async function distributeCallKey(
  roomJid: string,
  callId: string,
  key: string
): Promise<boolean> {
  if (!isE2eeEnabled() || !isE2eeRoom(roomJid)) return false;
  const omemo = await omemoReady();
  if (!omemo) return false;
  const recipients = roomRecipients(roomJid, domainOf(omemo.jid));
  try {
    return await omemo.sendGroupSignal(
      roomJid,
      recipients,
      [callKeyElement(callId, key)],
      `call-key-${callId || 'x'}-${Date.now().toString(36)}`
    );
  } catch (err) {
    console.warn('call E2EE: could not distribute key', err);
    return false;
  }
}

/**
 * Reads a decrypted <call-key> off a stanza the OMEMO seam has already
 * rewritten in place (so the element sits as an ordinary child). Returns
 * undefined when the stanza is not a call-key signal.
 */
export function parseCallKey(
  stanza: Element
): { callId: string; key: string } | undefined {
  const el = stanza?.getChild?.('call-key', NS_CALL_E2EE);
  if (!el) return undefined;
  const callId = String(el.attrs?.callId || '').trim();
  const key = String(el.attrs?.key || '').trim();
  if (!key) return undefined;
  return { callId, key };
}
