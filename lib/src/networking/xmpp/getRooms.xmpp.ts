import { Client, xml } from '@xmpp/client';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';
import { Element } from 'ltx';

export const getRooms = async (client: Client): Promise<any> => {
  let stanzaHdlrPointer: (stanza: Element) => void;

  const unsubscribe = () => {
    client.off('stanza', stanzaHdlrPointer);
  };

  const responsePromise = new Promise((resolve, reject) => {
    stanzaHdlrPointer = (stanza) => {};

    client.on('stanza', stanzaHdlrPointer);

    const message = xml(
      'iq',
      {
        type: 'get',
        from: client.jid?.toString(),
        id: 'getUserRooms',
      },
      xml('query', { xmlns: 'ns:getrooms' })
    );

    client.send(message).catch((err) => {
      console.error('Error sending getRooms request:', err);
      unsubscribe();
      reject(err);
    });
  });

  const timeoutPromise = createTimeoutPromise(2000, unsubscribe);

  try {
    return await Promise.race([responsePromise, timeoutPromise]);
  } catch (e) {
    console.error('Error in getRooms:', e);
    return null;
  }
};
