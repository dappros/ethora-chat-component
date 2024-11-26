import { Element } from 'ltx';
import { Client, xml } from '@xmpp/client';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';

export function createRoomPresence(roomId: string, client: Client) {
  let stanzaHdlrPointer: {
    (el: Element): void;
    (stanza: Element): void;
    (el: Element): void;
  };

  const unsubscribe = () => {
    client.off('stanza', stanzaHdlrPointer);
  };

  const responsePromise = new Promise((resolve, reject) => {
    stanzaHdlrPointer = (stanza: Element) => {
      if (
        stanza.is('presence') &&
        stanza.attrs['from'].split('/')[0] === roomId
      ) {
        const xEls = stanza.getChildren('x');

        if (xEls.length === 2) {
          const x = xEls.find(
            (el) => el.attrs['xmlns'] === 'http://jabber.org/protocol/muc#user'
          );

          if (x) {
            const statuses = x.getChildren('status');

            if (!statuses) {
              unsubscribe();
              reject('!statuses');
            }

            const codes = statuses.map((el) => el.attrs['code']);

            if (codes.includes('201') && codes.includes('110')) {
              console.log('createRoomPresence:resolve true');
              unsubscribe();
              resolve(true);
            } else {
              console.log(
                'createRoomPresence:reject, such room already exists'
              );
              unsubscribe();
              resolve(true);
            }
          } else {
            unsubscribe();
            reject();
          }
        }
      }
    };

    client.on('stanza', stanzaHdlrPointer);

    const message = xml(
      'presence',
      {
        to: `${roomId}/${client.jid.getLocal()}`,
      },
      xml('x', 'http://jabber.org/protocol/muc')
    );

    client.send(message);
  });

  const timeoutPromise = createTimeoutPromise(2000, unsubscribe);

  return Promise.race([responsePromise, timeoutPromise]);
}
