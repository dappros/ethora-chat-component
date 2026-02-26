import { Client, xml } from '@xmpp/client';
import { Element } from '@xmpp/xml';
import { createTimeoutPromise } from './createTimeoutPromise.xmpp';

export async function subscribeToRoomMessages(
  client: Client,
  roomJID: string,
  userNick?: string
): Promise<boolean> {
  const id = `newSubscription:${Date.now().toString()}`;
  let stanzaHandler: (stanza: Element) => void;

  const unsubscribe = () => {
    if (stanzaHandler) {
      client.off('stanza', stanzaHandler);
    }
  };

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (cb: (value?: any) => void, value?: any) => {
      if (settled) return;
      settled = true;
      setTimeout(() => {
        unsubscribe();
        cb(value);
      }, 500);
    };

    stanzaHandler = (stanza: Element) => {
      if (stanza.is('iq') && stanza.attrs.id === id) {
        if (stanza.attrs.type === 'result') {
          finish(resolve, true);
        } else if (stanza.attrs.type === 'error') {
          finish(resolve, false);
        }
      }
    };

    client.on('stanza', stanzaHandler);

    const nick = userNick || client.jid?.getLocal() || '';

    const subscribeStanza = xml(
      'iq',
      {
        to: roomJID,
        type: 'set',
        id: id,
      },
      xml(
        'subscribe',
        { xmlns: 'urn:xmpp:mucsub:0', nick: nick },
        xml('event', { node: 'urn:xmpp:mucsub:nodes:messages' })
      )
    );

    try {
      client.send(subscribeStanza);
    } catch (error) {
      unsubscribe();
      console.error('Error sending subscribe stanza:', error);
      reject(error);
      return;
    }

    createTimeoutPromise(5000, unsubscribe).catch(() => {
      if (!settled) {
        finish(reject, false);
      }
    });
  });
}
