import { Client, xml } from '@xmpp/client';
import { Element } from 'ltx';

export async function getChatsPrivateStoreRequest(client: Client) {
  const id = `get-chats-private-req:${Date.now().toString()}`;

  return new Promise((resolve, reject) => {
    let stanzaHdlrPointer: (stanza: Element) => void;

    const timeout = setTimeout(() => {
      client.off('stanza', stanzaHdlrPointer);
      reject(new Error('get-chats-private timed out'));
    }, 10000);

    stanzaHdlrPointer = (stanza: Element) => {
      if (stanza.is('iq') && stanza.attrs.id === id) {
        clearTimeout(timeout);
        client.off('stanza', stanzaHdlrPointer);

        if (stanza.attrs.type === 'error') {
          reject(new Error('Error response from server'));
          return;
        }

        const chatjson = stanza.getChild('query')?.getChild('chatjson');
        if (chatjson && chatjson.attrs.value) {
          try {
            const roomTimestampObject = JSON.parse(chatjson.attrs.value);
            resolve(roomTimestampObject);
          } catch (e) {
            reject(e);
          }
        } else {
          resolve(null);
        }
      }
    };

    client.on('stanza', stanzaHdlrPointer);

    const message = xml(
      'iq',
      { id, type: 'get' },
      xml(
        'query',
        { xmlns: 'jabber:iq:private' },
        xml('chatjson', { xmlns: 'chatjson:store' })
      )
    );

    client.send(message).catch((err) => {
      clearTimeout(timeout);
      client.off('stanza', stanzaHdlrPointer);
      reject(err);
    });
  });
}
