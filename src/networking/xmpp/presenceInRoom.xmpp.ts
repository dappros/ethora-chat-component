import { Client, xml } from '@xmpp/client';

export const presenceInRoom = (client: Client, roomJID: string) => {
  return new Promise((resolve, reject) => {
    try {
      const presence = xml(
        'presence',
        {
          from: client.jid?.toString(),
          to: `${roomJID}/${client.jid?.getLocal()}`,
          id: 'presenceInRoom',
        },
        xml('x', { xmlns: 'http://jabber.org/protocol/muc' })
      );

      client
        .send(presence)
        .then(() => {
          console.log('Presence in room successfully sent');
          resolve('Presence in room sent successfully');
        })
        .catch((error: any) => {
          console.error('Failed to send presence in room:', error);
          reject(error);
        });
    } catch (error) {
      console.error('An error occurred while setting presence in room:', error);
      reject(error);
    }
  });
};
