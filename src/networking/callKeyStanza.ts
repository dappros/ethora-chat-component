// Receive side of the call-key exchange (send side: e2ee/callKey.ts).
//
// By the time a stanza reaches here the OMEMO seam has already decrypted it in
// place, so a <call-key> signal looks like an ordinary child element. We lift
// the key into the call slice; VideoCallSession applies it to the LiveKit
// room's key provider. The signal is swallowed either way so it never renders
// as a chat message.

import { Element } from 'ltx';
import { store } from '../roomStore';
import { setCallE2eeKey } from '../roomStore/callSlice';
import { isE2eeEnabled } from '../e2ee';
import { parseCallKey } from '../e2ee/callKey';

/**
 * Claims a decrypted <call-key> signal, feeding the media key into the call
 * slice. Returns true when it handled the stanza (so the caller stops
 * dispatching it to the chat handlers).
 */
export function onCallKeyStanza(stanza: Element): boolean {
  if (!isE2eeEnabled()) return false;
  const parsed = parseCallKey(stanza);
  if (!parsed) return false;
  store.dispatch(
    setCallE2eeKey({ callId: parsed.callId || null, key: parsed.key })
  );
  return true;
}
