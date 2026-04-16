import { Client, xml } from '@xmpp/client';
import { Element } from 'ltx';
import { safeJsonParse } from '../../helpers/safeJson';

export async function getChatsPrivateStoreRequest(client: Client) {
  const id = `get-chats-private-req:${Date.now().toString()}`;

  return new Promise((resolve, reject) => {
    let stanzaHdlrPointer: (stanza: Element) => void;
    let finished = false;

    const unsubscribe = () => {
      if (finished) return;
      finished = true;
      try {
        (client as any)?.off?.('stanza', stanzaHdlrPointer);
      } catch {
      }
    };

    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('get-chats-private timed out'));
    }, 10000);

    stanzaHdlrPointer = (stanza: Element) => {
      if (stanza.is('iq') && stanza.attrs.id === id) {
        clearTimeout(timeout);
        unsubscribe();

        if (stanza.attrs.type === 'error') {
          reject(new Error('Error response from server'));
          return;
        }

        const chatjson = stanza.getChild('query')?.getChild('chatjson');
        if (chatjson && chatjson.attrs.value) {
          const roomTimestampObject = safeJsonParse(chatjson.attrs.value, null);
          resolve(roomTimestampObject);
        } else {
          resolve(null);
        }
      }
    };

    (client as any)?.on?.('stanza', stanzaHdlrPointer);

    const message = xml(
      'iq',
      { id, type: 'get' },
      xml(
        'query',
        { xmlns: 'jabber:iq:private' },
        xml('chatjson', { xmlns: 'chatjson:store' })
      )
    );

    const sendResult = (client as any)?.send?.(message);
    if (!sendResult || typeof sendResult.catch !== 'function') {
      clearTimeout(timeout);
      unsubscribe();
      reject(new Error('XMPP client is unavailable'));
      return;
    }

    sendResult.catch((err: unknown) => {
      clearTimeout(timeout);
      unsubscribe();
      reject(err);
    });
  });
}
