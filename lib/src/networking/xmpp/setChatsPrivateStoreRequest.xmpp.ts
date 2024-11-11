import { Client, xml } from '@xmpp/client';
import { Element } from 'ltx';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';

export async function setChatsPrivateStoreRequest(
  client: Client,
  jsonObj: string
) {
  const id = `set-chats-private-req:${Date.now().toString()}`;
  let stanzaHdlrPointer: {
    (el: Element): void;
    (stanza: Element): void;
    (el: Element): void;
  };

  const unsubscribe = () => {
    client?.off('stanza', stanzaHdlrPointer);
  };

  const responsePromise = new Promise((resolve, _reject) => {
    stanzaHdlrPointer = (stanza: Element) => {
      if (stanza.is('iq') && stanza.attrs.id === id) {
        resolve(true);
      }
    };

    client?.on('stanza', stanzaHdlrPointer);

    const message = xml(
      'iq',
      {
        id: id,
        type: 'set',
      },
      xml(
        'query',
        { xmlns: 'jabber:iq:private' },
        xml('chatjson', { xmlns: 'chatjson:store', value: jsonObj })
      )
    );

    client?.send(message);
  });

  const timeoutPromise = createTimeoutPromise(2000, unsubscribe);

  return Promise.race([responsePromise, timeoutPromise]);
}
