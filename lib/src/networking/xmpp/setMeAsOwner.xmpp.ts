import { Element } from 'ltx';
import { Client, xml } from '@xmpp/client';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';

export function setMeAsOwner(roomId: string, client: Client) {
  const id = `set-me-as-owner:${Date.now().toString()}`;

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
      if (
        stanza.is('iq') &&
        stanza.attrs['id'] === id &&
        stanza.attrs['type'] === 'result'
      ) {
        unsubscribe();
        resolve(true);
      }
    };

    client.on('stanza', stanzaHdlrPointer);

    const message = xml(
      'iq',
      {
        to: roomId,
        id: id,
        type: 'set',
      },
      xml(
        'query',
        { xmlns: 'http://jabber.org/protocol/muc#owner' },
        xml('x', { xmlns: 'jabber:x:data', type: 'submit' })
      )
    );

    client.send(message);
  });

  const timeoutPromise = createTimeoutPromise(2000, unsubscribe);

  return Promise.race([responsePromise, timeoutPromise]);
}
