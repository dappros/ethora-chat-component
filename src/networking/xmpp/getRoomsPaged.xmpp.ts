import { Client, xml } from '@xmpp/client';
import { createCancelableTimeoutPromise } from './createTimeoutPromise.xmpp';
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
    client?.off?.('stanza', stanzaHdlrPointer);
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let cancelTimeout: (() => void) | null = null;

    stanzaHdlrPointer = (stanza) => {
      // Must match the id we actually send below ('getUserRoomsPaged') -
      // this used to check for the unrelated literal 'getUserRooms', which
      // the server's response id never matches, so every call fell through
      // to the 2s timeout instead of resolving on the real reply.
      if (stanza.is('iq') && stanza.attrs.id === 'getUserRoomsPaged') {
        settled = true;
        cancelTimeout?.();
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

    const { promise: timeoutPromise, cancel } = createCancelableTimeoutPromise(
      2000,
      unsubscribe
    );
    cancelTimeout = cancel;
    void timeoutPromise.catch((err) => {
      if (settled) return;
      reject(err);
    });
  });
};
