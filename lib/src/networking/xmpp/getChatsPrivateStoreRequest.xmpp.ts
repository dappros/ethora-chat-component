import { Client, xml } from '@xmpp/client';
import { Element } from 'ltx';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';
import { store } from '../../roomStore';
import { setLastViewedTimestamp } from '../../roomStore/roomsSlice';

export async function getChatsPrivateStoreRequest(client: Client) {
  const id = `get-chats-private-req:${Date.now().toString()}`;
  let stanzaHdlrPointer: {
    (el: Element): void;
    (stanza: any): void;
  };

  const unsubscribe = () => {
    client.off('stanza', stanzaHdlrPointer);
  };

  const responsePromise = new Promise((resolve, _reject) => {
    try {
      stanzaHdlrPointer = (stanza: Element) => {
        if (stanza.is('iq') && stanza.attrs.id === id) {
          let chatjson = stanza.getChild('query')?.getChild('chatjson');

          if (chatjson && chatjson?.attrs?.value) {
            const roomTimestampObject = JSON.parse(chatjson.attrs.value);
            resolve(roomTimestampObject);
          } else {
            resolve(null);
          }
        }
      };
    } catch (error) {
      console.log('err', error);
    }

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

  try {
    const res = await Promise.race([responsePromise, timeoutPromise]);
    return res;
  } catch (e) {
    console.log('=-> error in getting last read timestamps', e);
    return null;
  }
}
