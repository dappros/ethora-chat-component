import { Client, xml } from '@xmpp/client';
import { createCancelableTimeoutPromise } from './createTimeoutPromise.xmpp';
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
  timeoutMs = 2000,
  // How many of the room's recent messages the MUC service replays on join
  // (RFC 6121 / XEP-0045 <history/>). Default 0: history comes from MAM only.
  // Without the element the server replays its default (ejabberd: up to 20
  // stanzas) for EVERY room joined, which for an account with many rooms is
  // N rooms * 20 messages of wire traffic that MAM then fetches again.
  historyStanzas = 0
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
    // Cleared as soon as the promise settles by any other path (success or
    // a presence error stanza), so the timeout timer doesn't linger and
    // fire pointlessly after we already know the outcome.
    let cancelTimeout: (() => void) | null = null;

    const finish = (cb: (value?: any) => void, value?: any) => {
      if (settled) return;
      settled = true;
      cancelTimeout?.();

      setTimeout(() => {
        unsubscribe();
        cb(value);
      }, delay);
    };

    stanzaHandler = (stanza) => {
      if (
        stanza.is('presence') &&
        stanza.attrs.id === stanzaId &&
        stanza.attrs.from?.startsWith(roomJID)
      ) {
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
          cancelTimeout?.();
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
      xml(
        'x',
        { xmlns: 'http://jabber.org/protocol/muc' },
        xml('history', {
          maxstanzas: String(
            Number.isFinite(historyStanzas) && historyStanzas > 0
              ? Math.floor(historyStanzas)
              : 0
          ),
        })
      )
    );

    client
      .send(presence)
      .then(() => {
        const { promise, cancel } = createCancelableTimeoutPromise(
          timeoutMs,
          unsubscribe
        );
        cancelTimeout = cancel;
        promise.catch(() => {
          if (settled) return;
          settled = true;
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
