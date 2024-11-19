import { xml } from '@xmpp/client';

export const getRoomMembers = (roomJID: string, client: any) => {
  client.activeChat = roomJID;
  const message = xml(
    'iq',
    {
      id: 'roomMemberInfo',
      type: 'get',
    },
    xml('query', { xmlns: 'ns:room:last', room: roomJID })
  );
  client.send(message);
};
