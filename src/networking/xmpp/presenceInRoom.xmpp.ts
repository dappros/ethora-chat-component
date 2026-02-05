import { Client, xml } from '@xmpp/client';
import { Element } from '@xmpp/xml';
export const presenceInRoom = async (
  client: Client,
  roomJID: string,
  delay = 2000,
  timeoutMs = 6000
): Promise<Element | null> => {
  let stanzaHandler: ((stanza: Element) => void) | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = () => {
    try {
      if (stanzaHandler) client.off('stanza', stanzaHandler);
    } catch (e) {}
    stanzaHandler = null;
  };

  return new Promise(async (resolve, reject) => {
    let settled = false;

    const finish = (value: Element | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      // Small delay keeps join/roster churn calmer for some servers.
      setTimeout(() => {
        unsubscribe();
        resolve(value);
      }, delay);
    };

    stanzaHandler = (stanza) => {
      if (!stanza.is('presence')) return;
      if (!stanza.attrs?.from?.startsWith(`${roomJID}/`)) return;

      // Different servers may not preserve/echo our 'id' attribute.
      // We treat any MUC-related presence from the room as a join confirmation.
      const mucUserX = stanza.getChild(
        'x',
        'http://jabber.org/protocol/muc#user'
      );
      const mucX = stanza.getChild('x', 'http://jabber.org/protocol/muc');
      if (!mucUserX && !mucX) return;

      finish(stanza);
    };

    client.on('stanza', stanzaHandler);

    timeoutId = setTimeout(() => {
      // Don't reject: callers use this only as a "best effort" join.
      // If we reject here, it can block presencesReady and keep messages pending forever.
      finish(null);
    }, timeoutMs);

    const presence = xml(
      'presence',
      {
        from: client.jid?.toString(),
        to: `${roomJID}/${client.jid?.getLocal()}`,
        id: 'presenceInRoom',
      },
      xml('x', { xmlns: 'http://jabber.org/protocol/muc' })
    );

    try {
      await client.send(presence);
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
      reject(err);
    }
  });
};
