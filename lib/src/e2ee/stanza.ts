// Turning an OMEMO stanza back into an ordinary one.
//
// There are two independent paths that read a message's <body> in this SDK -
// handleStanza (live traffic) and XmppClient.parseMamMessages (archive pages
// collected by routeMamStanza) - and neither goes through the other. Both
// have to decrypt, so the work lives here rather than in either of them.
//
// The rewrite is done in place: <encrypted> is replaced by the children of
// the SCE envelope, so everything downstream (getDataFromXml, the reaction /
// edit / history handlers, the room store) sees exactly the stanza an
// unencrypted sender would have produced and needs to know nothing about
// OMEMO.

import { Element, parse } from 'ltx';
import { translateKey } from '../i18n/strings';
import { store } from '../roomStore';
import { NS_OMEMO } from './omemo';
import { omemoReady, senderJidFromMuc } from './index';

export type DecryptOutcome =
  /** No OMEMO payload; the caller should carry on as before. */
  | 'not-encrypted'
  /** Rewritten with the sender's original children. */
  | 'decrypted'
  /** Rewritten with a placeholder body; still a message worth showing. */
  | 'undecryptable'
  /** Session maintenance only - there is nothing to render, skip it. */
  | 'drop';

/**
 * Finds the <message> that actually carries <encrypted>, looking through the
 * wrappers a message can arrive in: a mucsub event, a MAM <result>/<forwarded>
 * pair, or both at once.
 */
export function encryptedCarrier(
  stanza: Element,
  depth = 0
): Element | undefined {
  if (depth > 4 || !stanza?.getChild) return undefined;
  if (stanza.name === 'message' && stanza.getChild('encrypted', NS_OMEMO)) {
    return stanza;
  }
  for (const child of stanza.children ?? []) {
    if (typeof child === 'string') continue;
    const found = encryptedCarrier(child as Element, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function placeholder(error: string | undefined): Element {
  const settings = store.getState()?.chatSettingStore;
  return new Element('body', {}).t(
    translateKey(
      error === 'omemo_not_encrypted_for_this_device'
        ? 'e2ee.otherDevice'
        : 'e2ee.undecryptable',
      settings?.config?.i18n?.locale || settings?.langSource,
      settings?.config?.i18n?.strings
    )
  );
}

/**
 * Decrypts `stanza` in place, if it carries OMEMO at all.
 *
 * `stanza` may be the message itself or anything wrapping it. Safe to call on
 * every message: without an OMEMO payload it returns immediately and touches
 * nothing.
 */
export async function decryptStanzaInPlace(
  stanza: Element,
  domain: string
): Promise<DecryptOutcome> {
  const carrier = encryptedCarrier(stanza);
  if (!carrier) return 'not-encrypted';

  const encrypted = carrier.getChild('encrypted', NS_OMEMO);
  // No payload: a session-maintenance message. It carries nothing to show, so
  // it must not reach the message handlers at all.
  if (!encrypted?.getChild('payload')) return 'drop';

  const from = String(carrier.attrs?.from || '');
  const roomJid = from.split('/')[0];
  const sender = senderJidFromMuc(from, domain);
  // Awaited rather than read: the server starts pushing archived messages as
  // soon as we join a room, which routinely beats our own key publish. Reading
  // the instance here would leave that first page permanently undecryptable.
  const crypto = await omemoReady();
  const decrypted = sender
    ? await crypto?.decrypt(carrier, sender, roomJid)
    : undefined;

  // The fallback <body> and the OMEMO elements exist for clients that cannot
  // decrypt; drop them either way. Keeping the fallback on failure would be
  // worse than a placeholder - it says "your client cannot read it", which is
  // the wrong reason.
  carrier.remove('encrypted', NS_OMEMO);
  carrier.remove('encryption', 'urn:xmpp:eme:0');
  carrier.remove('body');

  let outcome: DecryptOutcome;
  if (decrypted?.content) {
    // `parse` needs a single root, so wrap the sibling list in one
    const wrapper = parse(`<omemo-content>${decrypted.content}</omemo-content>`);
    carrier.append(...wrapper.children);
    outcome = 'decrypted';
  } else {
    carrier.append(placeholder(decrypted?.error));
    outcome = 'undecryptable';
  }

  // Marks the message as having arrived encrypted - which is true of both
  // branches, including the one we could not read. A message encrypted for a
  // device we do not have is still an encrypted message, and labelling it
  // "sent in clear" would be the opposite of what happened.
  //
  // <data> is the channel because createMessageFromXml spreads its attributes
  // straight onto IMessage. On the undecryptable branch there is none (it came
  // out of the envelope we could not open), so one is created to carry this.
  markEncrypted(carrier);
  return outcome;
}

function markEncrypted(carrier: Element): void {
  let data = carrier.getChild('data');
  if (!data) {
    data = new Element('data', {});
    carrier.append(data);
  }
  data.attrs.omemoEncrypted = 'true';
}
