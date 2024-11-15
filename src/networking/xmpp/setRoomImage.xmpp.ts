import { Client, xml } from '@xmpp/client';

export function setRoomImage(
  roomJid: string,
  roomThumbnail: string,
  type: string,
  client: Client,
  roomBackground?: string
) {
  {
    const message = xml(
      'iq',
      {
        id: type === 'icon' ? 'setRoomImage' : 'setRoomBackgroundImage',
        type: 'set',
      },
      xml('query', {
        xmlns: 'ns:getrooms:setprofile',
        room_thumbnail: roomThumbnail,
        room_background: roomBackground ? roomBackground : '',
        room: roomJid,
      })
    );
    client.send(message);
  }
}
