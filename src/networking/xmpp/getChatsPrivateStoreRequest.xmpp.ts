import { Client, xml } from '@xmpp/client';
import { Element } from 'ltx';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';

export async function getChatsPrivateStoreRequest(client: Client) {
  const id = `get-chats-private-req:${Date.now().toString()}`;
  let stanzaHdlrPointer: {
    (el: Element): void;
    (stanza: Element): void;
    (el: Element): void;
  };

  const unsubscribe = () => {
    client.off('stanza', stanzaHdlrPointer);
  };

  const responsePromise = new Promise((resolve, _reject) => {
    stanzaHdlrPointer = (stanza: Element) => {
      if (stanza.is('iq') && stanza.attrs.id === id) {
        let chatjson = stanza.getChild('query')?.getChild('chatjson');

        if (chatjson) {
          resolve(chatjson.attrs.value);
        } else {
          resolve(null);
        }
      }
    };

    client.on('stanza', stanzaHdlrPointer);

    const message = xml(
      'iq',
      {
        id: id,
        type: 'get',
      },
      xml(
        'query',
        { xmlns: 'jabber:iq:private' },
        xml('chatjson', { xmlns: 'chatjson:store' })
      )
    );

    client.send(message);
  });

  const timeoutPromise = createTimeoutPromise(2000, unsubscribe);

  return Promise.race([responsePromise, timeoutPromise]);
}
