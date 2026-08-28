import { Client, xml } from '@xmpp/client';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';
import { Element } from '@xmpp/xml';

const isValidMucJid = (jid: unknown): jid is string => {
  if (typeof jid !== 'string') return false;
  if (!jid.includes('@')) return false;
  const domain = jid.split('@')[1]?.split('/')[0];
  if (!domain || !domain.includes('.')) return false;
  return domain.startsWith('conference.');
};

let presenceIdCounter = 0;
const nextPresenceId = () =>
  `presenceInRoom-${Date.now().toString(36)}-${(++presenceIdCounter).toString(36)}`;

export const presenceInRoom = async (
  client: Client,
  roomJID: string,
  delay = 2000,
  timeoutMs = 2000
): Promise<Element> => {
  if (!isValidMucJid(roomJID)) {
    return Promise.reject(
      new Error(`presence_invalid_jid:${String(roomJID)}`)
    );
  }
  let stanzaHandler: (stanza: Element) => void;

  const unsubscribe = () => client?.off?.('stanza', stanzaHandler);
  const stanzaId = nextPresenceId();

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (cb: (value?: any) => void, value?: any) => {
      if (settled) return;
      settled = true;

      setTimeout(() => {
        unsubscribe();
        cb(value);
      }, delay);
    };

    // Two ways a join can be confirmed:
    //
    // 1. The server echoes our presence stanza with the same `id` we
    //    sent. Ejabberd does this; it's the strongest correlation.
    // 2. A presence stanza arrives `from = roomJID/<resource>` and
    //    carries a MUC namespace `<x xmlns=".../muc..."/>` child. This
    //    is the standard XEP-0045 confirmation shape — every spec-
    //    compliant MUC server emits it on successful join, even if it
    //    doesn't echo our `id` back. Some non-Ejabberd deployments
    //    (and older Ejabberd configs) skip the id-echo, which used to
    //    cause the join to wait until timeout → reject → caller
    //    treats it as failure → message resend loops → bubbles stuck
    //    as "pending". The second match path closes that gap.
    const isMucXmlnsChild = (child: Element): boolean =>
      child?.name === 'x' &&
      typeof child.attrs?.xmlns === 'string' &&
      child.attrs.xmlns.startsWith('http://jabber.org/protocol/muc');

    const matchesJoinConfirmation = (stanza: Element): boolean => {
      if (!stanza.is('presence')) return false;
      const from = stanza.attrs.from;
      if (!from?.startsWith(roomJID)) return false;
      // Fast path: id echo matches.
      if (stanza.attrs.id === stanzaId) return true;
      // Fallback path: must come from a /resource (i.e. an occupant
      // self-presence, not the bare room jid) and carry a MUC <x>.
      if (!from.includes('/')) return false;
      return stanza.getChildren('x').some(isMucXmlnsChild);
    };

    stanzaHandler = (stanza) => {
      if (matchesJoinConfirmation(stanza)) {
        if (stanza.attrs.type === 'error') {
          const errEl = stanza.getChild('error');
          const code =
            (errEl &&
              (errEl.getChild('forbidden')
                ? 'forbidden'
                : errEl.getChild('remote-server-not-found')
                  ? 'remote-server-not-found'
                  : errEl.getChild('not-allowed')
                    ? 'not-allowed'
                    : errEl.getChild('item-not-found')
                      ? 'item-not-found'
                      : errEl.attrs?.type || 'unknown')) ||
            'unknown';
          settled = true;
          unsubscribe();
          reject(new Error(`presence_error:${code}:${roomJID}`));
          return;
        }
        finish(resolve, stanza);
      }
    };

    client.on('stanza', stanzaHandler);

    const presence = xml(
      'presence',
      {
        from: client.jid?.toString(),
        to: `${roomJID}/${client.jid?.getLocal()}`,
        id: stanzaId,
      },
      xml('x', { xmlns: 'http://jabber.org/protocol/muc' })
    );

    client
      .send(presence)
      .then(() => {
        void createTimeoutPromise(timeoutMs, unsubscribe).catch(() => {
          reject(new Error(`presence_timeout:${roomJID}`));
        });
      })
      .catch((err) => {
        unsubscribe();
        reject(
          new Error(
            `presence_send_failed:${roomJID}:${err instanceof Error ? err.message : String(err)}`
          )
        );
      });
  });
};
