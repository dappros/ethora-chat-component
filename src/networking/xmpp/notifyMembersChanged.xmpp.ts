import { Client, xml } from '@xmpp/client';

export const MEMBERS_REFRESH_XMLNS = 'ethora:chats:members-refresh';

export async function notifyMembersChanged(
  client: Client,
  roomJid: string,
  xmppUsername: string,
  affiliation: 'member' | 'none' = 'member'
) {
  const id = `members-changed-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const message = xml(
    'message',
    { to: roomJid, type: 'groupchat', id },
    xml('members-refresh', { xmlns: MEMBERS_REFRESH_XMLNS }),
    xml('no-store', 'urn:xmpp:hints'),
    xml(
      'x',
      'http://jabber.org/protocol/muc#user',
      xml('item', { affiliation, nick: xmppUsername })
    )
  );
  client.send(message);
}
