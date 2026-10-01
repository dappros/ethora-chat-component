interface PersonLike {
  _id?: string;
  id?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  xmppUsername?: string;
}

const fullName = (person?: PersonLike): string => {
  if (!person) return '';
  const name = `${person.firstName || ''} ${person.lastName || ''}`.trim();
  return name || person.name || '';
};

/** `appId_userId@xmpp.host` (or without the host) -> `appId_userId`. */
export const localPart = (jid?: string): string =>
  String(jid || '').split('@')[0];

interface Sources {
  /** rooms.usersSet: keyed by `appId_userId`. */
  usersSet?: Record<string, PersonLike>;
  /** The hit's room members, which carry the user id search reports. */
  members?: PersonLike[];
  myXmppUsername?: string;
}

/**
 * Who sent a search hit.
 *
 * `from` arrives as a full JID with the XMPP host on it, while usersSet is
 * keyed by the local part, so looking it up as-is found nobody and every hit
 * was attributed to "Someone". The user id (`fromUserId`) is the other way
 * in: room members carry it as `_id`.
 */
export function resolveSender(
  hit: { from: string; fromUserId: string },
  { usersSet, members, myXmppUsername }: Sources
): { name: string; isSelf: boolean } {
  const from = localPart(hit.from);
  const isSelf = Boolean(myXmppUsername) && from === localPart(myXmppUsername);
  if (isSelf) return { name: '', isSelf: true };

  const name =
    fullName(usersSet?.[from]) ||
    fullName(
      members?.find((member) => hit.fromUserId && member._id === hit.fromUserId)
    ) ||
    '';
  return { name, isSelf: false };
}
