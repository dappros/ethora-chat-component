import { Element } from 'ltx';
import { Client, xml } from '@xmpp/client';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';

export function setMeAsOwner(roomJID: string, userJID: string, client: Client) {
  let stanzaHdlrPointer: {
    (el: Element): void;
    (stanza: Element): void;
    (el: Element): void;
  };

  const unsubscribe = () => {
    client.off('stanza', stanzaHdlrPointer);
  };

  const responsePromise = new Promise((resolve) => {
    stanzaHdlrPointer = (stanza: Element) => {
      if (stanza.is('iq') && stanza.attrs['type'] === 'result') {
        unsubscribe();
        resolve(true);
      }
    };

    client.on('stanza', stanzaHdlrPointer);

    const message = xml(
      'iq',
      {
        type: 'set',
        from: client.jid?.toString(),
        id: 'newSubscription',
        to: roomJID,
      },
      xml(
        'subscribe',
        {
          xmlns: 'urn:xmpp:mucsub:0',
          nick: userJID,
        },
        xml('event', { node: 'urn:xmpp:mucsub:nodes:messages' })
      )
    );

    client.send(message);
  });

  const timeoutPromise = createTimeoutPromise(2000, unsubscribe);

  return Promise.race([responsePromise, timeoutPromise]);
}
