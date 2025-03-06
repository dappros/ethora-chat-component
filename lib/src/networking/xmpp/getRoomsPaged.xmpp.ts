import { Client, xml } from '@xmpp/client';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';
import { Element } from '@xmpp/xml';

export const getRoomsPaged = async (
  client: Client,
  maxResults = 3,
  before = null
) => {
  let stanzaHdlrPointer: {
    (el: Element): void;
    (stanza: any): void;
    (el: Element): void;
  };

  const unsubscribe = () => {
    client.off('stanza', stanzaHdlrPointer);
  };

  return new Promise(async (resolve, reject) => {
    stanzaHdlrPointer = (stanza) => {
      if (stanza.is('iq') && stanza.attrs.id === 'getUserRooms') {
        unsubscribe();
        resolve(stanza);
      }
    };

    client.on('stanza', stanzaHdlrPointer);

    const query = xml('query', { xmlns: 'ns:getrooms' });
    const set = xml(
      'set',
      { xmlns: 'http://jabber.org/protocol/rsm' },
      xml('max', {}, maxResults.toString())
    );

    if (before) {
      set.append(xml('before', {}, before));
    }

    query.append(set);

    const message = xml(
      'iq',
      { type: 'get', from: client.jid?.toString(), id: 'getUserRoomsPaged' },
      query
    );

    try {
      client.send(message);
    } catch (err) {
      console.error('Error sending getRooms request:', err);
      unsubscribe();
      reject(err);
    }

    await createTimeoutPromise(2000, unsubscribe).catch(reject);
  });
};
