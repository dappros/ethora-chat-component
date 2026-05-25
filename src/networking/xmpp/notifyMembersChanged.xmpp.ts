import { Client, xml } from '@xmpp/client';

// Broadcast a "this room's members changed, refetch please" signal into
// the MUC. Standard XMPP forwards groupchat messages to every current
// occupant, so this fans the wake-up out to everyone currently
// connected — without depending on (a) the backend emitting a real
// server-side MUC affiliation broadcast on /chats/users-access (many
// don't), or (b) the invitee actually being online and joining via
// presence (which never happens if they're offline).
//
// We intentionally do NOT carry the member payload (jid/nick/...) on the
// wire. Two reasons:
//  1. members[] / firstName / lastName / _id should be sourced from the
//     authoritative REST /chats/my, not synthesized from a nickname
//     someone in the room shouted into XMPP. Synthesizing creates
//     blank-profile placeholder entries that look like duplicates.
//  2. Anyone in the room can send arbitrary XMPP. Treating this signal
//     as "go ask the backend" makes it un-spoofable in any meaningful
//     way — the worst a malicious occupant can do is make others burn
//     a /chats/my call.
//
// `<no-store/>` (XEP-0334) hints the server to skip archiving this
// body-less notification into MAM so it doesn't replay on history
// rehydrate.
export const MEMBERS_REFRESH_XMLNS = 'ethora:chats:members-refresh';

export async function notifyMembersChanged(
  client: Client,
  roomJid: string
) {
  const id = `members-refresh-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const message = xml(
    'message',
    { to: roomJid, type: 'groupchat', id },
    xml('no-store', 'urn:xmpp:hints'),
    xml('members-refresh', MEMBERS_REFRESH_XMLNS)
  );
  client.send(message);
}
