import { Client, xml } from '@xmpp/client';

export const leaveTheRoom = (roomJID: string, client: Client) => {
  if (!client.jid) {
    throw new Error(
      'Client JID is not set. Ensure the client is authenticated before calling this function.'
    );
  }
  const message = xml('presence', {
    to: `${roomJID}/${client.jid.getLocal()}`,
    type: 'unavailable',
  });

  client.send(message);
};
