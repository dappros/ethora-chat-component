import { Client, xml } from '@xmpp/client';

export function sendMessageReaction(
  client: Client,
  messageId: string,
  roomJid: string,
  reactionsList: string[],
  data: any,
  reactionSymbol?: any,
) {
  const id = `message-reaction:${Date.now().toString()}`;

  const dataReaction = {
    senderFirstName: data.firstName,
    senderLastName: data.lastName,
  }

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
        from: client.jid?.toString(),
        xmlns: 'urn:xmpp:reactions:0',
      },
      ...reactionsList.map((reaction) => xml('reaction', {}, reaction ?? ''))
      // xml('reaction', {}, reactionSymbol ?? '👋'),
    ),
    xml('data', dataReaction),
    xml('store', { xmlns: 'urn:xmpp:hints' })
  );

  client.send(message);
}
