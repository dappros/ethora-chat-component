import { Client, xml } from '@xmpp/client';

export function sendMessageReaction(
  client: Client,
  messageId: string,
  roomJid: string,
  reactionsList: string[],
  reactionSymbol?: any,
) {
  const id = `message-reaction:${Date.now().toString()}`;

  console.log('reactionsList', reactionsList);

  const message = xml(
    'message',
    {
      id: id,
      type: 'groupchat',
      from: client.jid?.toString(),
      to: roomJid,
    },
    xml(
      'reactions',
      {
        id: messageId,
        xmlns: 'urn:xmpp:reactions:0',
      },
      ...reactionsList.map((reaction) => xml('reaction', {}, reaction ?? ''))
      // xml('reaction', {}, reactionSymbol ?? '👋'),
    ),
    xml('store', { xmlns: 'urn:xmpp:hints' })
  );

  client.send(message);
}
