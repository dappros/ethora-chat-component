import { Client, xml } from '@xmpp/client';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';
import { Element } from '@xmpp/xml';
export const presenceInRoom = async (
  client: Client,
  roomJID: string,
  delay = 2000,
  timeoutMs = 2000
): Promise<Element> => {
  let stanzaHandler: (stanza: Element) => void;

  const unsubscribe = () => client.off('stanza', stanzaHandler);

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

    stanzaHandler = (stanza) => {
      if (
        stanza.is('presence') &&
        stanza.attrs.id === 'presenceInRoom' &&
        stanza.attrs.from?.startsWith(roomJID)
      ) {
        finish(resolve, stanza);
      }
    };

    client.on('stanza', stanzaHandler);

    const presence = xml(
      'presence',
      {
        from: client.jid?.toString(),
        to: `${roomJID}/${client.jid?.getLocal()}`,
        id: 'presenceInRoom',
      },
      xml('x', { xmlns: 'http://jabber.org/protocol/muc' })
    );

    try {
      await client.send(presence);
    } catch (err) {
      unsubscribe();
      reject(
        new Error(
          `presence_send_failed:${roomJID}:${err instanceof Error ? err.message : String(err)}`
        )
      );
      return;
    }

    void createTimeoutPromise(timeoutMs, unsubscribe).catch(() => {
      reject(new Error(`presence_timeout:${roomJID}`));
    });
  });
};
