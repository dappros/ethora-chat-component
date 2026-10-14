import { Client, xml } from '@xmpp/client';

// XEP-0184 delivery receipt, broadcast to the room (mirrors
// sendMessageReaction.xmpp.ts) so every occupant can render tick state -
// the top-level stanza `from` gets rewritten to the room/nick by the MUC
// server, so the real xmppUsername travels in the <received> `from` attr.
export function sendReceivedReceipt(
  client: Client,
  messageId: string,
  roomJid: string
) {
  const id = `message-received:${Date.now().toString()}`;

  const message = xml(
    'message',
    {
      id,
      type: 'groupchat',
      from: client.jid?.toString(),
      to: roomJid,
    },
    xml('received', {
      xmlns: 'urn:xmpp:receipts',
      id: messageId,
      from: client.jid?.toString(),
    }),
    xml('store', { xmlns: 'urn:xmpp:hints' })
  );

  client.send(message);
}
