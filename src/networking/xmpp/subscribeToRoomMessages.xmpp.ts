import { Client, xml } from '@xmpp/client';
import { Element } from '@xmpp/xml';
import { createCancelableTimeoutPromise } from './createTimeoutPromise.xmpp';

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason?: 'forbidden' | 'error' | 'timeout'; message?: string };

export async function subscribeToRoomMessages(
  client: Client,
  roomJID: string,
  userNick?: string
): Promise<SubscribeResult> {
  const id = `newSubscription:${Date.now().toString()}`;
  let stanzaHandler: (stanza: Element) => void;

  const unsubscribe = () => {
    if (stanzaHandler) {
      client?.off?.('stanza', stanzaHandler);
    }
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    // Cleared once the promise settles via the success/error stanza path,
    // so the 5s timeout timer below doesn't stay alive (and fire a no-op)
    // after the real answer already arrived.
    let cancelTimeout: (() => void) | null = null;

    const finish = (cb: (value?: any) => void, value?: any) => {
      if (settled) return;
      settled = true;
      // Settle immediately: the matching iq result is final, and a delay
      // here used to add 500ms per room to the startup subscription sweep.
      cancelTimeout?.();
      unsubscribe();
      cb(value);
    };

    // <iq xmlns='jabber:client' xml:lang='en' to='646cc8dc96d4a4dc8f7b2f2d_69a6358f66cb3e74bcbcd6b2@xmpp.chat.ethora.com/515555070583875399454338' from='646cc8dc96d4a4dc8f7b2f2d_69a6376b66cb3e74bcbcda9f@conference.xmpp.chat.ethora.com' type='result' id='newSubscription:1772618245224'><subscribe nick='646cc8dc96d4a4dc8f7b2f2d_69a6358f66cb3e74bcbcd6b2' xmlns='urn:xmpp:mucsub:0'><event node='urn:xmpp:mucsub:nodes:messages'/></subscribe></iq>

    stanzaHandler = (stanza: Element) => {
      if (stanza.is('iq') && stanza.attrs.id === id) {
        if (stanza.attrs.type === 'result') {
          finish(resolve, { ok: true });
        } else if (stanza.attrs.type === 'error') {
          const errorEl = stanza.getChild('error');
          const forbidden = errorEl?.getChild(
            'forbidden',
            'urn:ietf:params:xml:ns:xmpp-stanzas'
          );
          const textEl = errorEl?.getChild(
            'text',
            'urn:ietf:params:xml:ns:xmpp-stanzas'
          );
          finish(resolve, {
            ok: false,
            reason: forbidden ? 'forbidden' : 'error',
            message: textEl?.text?.() || undefined,
          });
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
      resolve({ ok: false, reason: 'error', message: String(error) });
      return;
    }

    const { promise: timeoutPromise, cancel } = createCancelableTimeoutPromise(
      5000,
      unsubscribe
    );
    cancelTimeout = cancel;
    timeoutPromise.catch(() => {
      if (!settled) {
        finish(resolve, { ok: false, reason: 'timeout' });
      }
    });
  });
}
