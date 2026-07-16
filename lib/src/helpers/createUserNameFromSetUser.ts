import { IMessage, RoomMember } from '../types/types';

/**
 * Cache-only lookup. Returns the literal "Deleted User" as a MISS sentinel
 * when `usersSet` has no entry for `userId` yet - callers that want a
 * better fallback (e.g. resolveSenderDisplayName below) check for that
 * exact string rather than treating it as a real name.
 */
export const createUserNameFromSetUser = (
  usersSet: Record<string, RoomMember>,
  userId: string
): string => {
  const user = usersSet[userId];

  if (!user) return 'Deleted User';

  const firstName = user.firstName?.trim() || '';
  const lastName = user.lastName?.trim() || '';

  return `${firstName} ${lastName}`.trim() || userId;
};

/**
 * The sender's display name, resolved WITHOUT depending on `usersSet`
 * having already been hydrated.
 *
 * `usersSet` is populated by a separate fetch (member list / presence) that
 * can still be in flight when a message arrives - most reliably right after
 * reconnect, when a burst of catch-up messages can land before that fetch
 * resolves. A cache-only lookup shows the literal "Deleted User" for every
 * one of those messages, even though the sender is very much not deleted.
 *
 * The message itself already carries the sender's name on the wire: every
 * client that sends through this SDK stamps `senderFirstName` /
 * `senderLastName` / `fullName` onto the outgoing stanza's `<data>` element
 * (see sendTextMessage.xmpp.ts / sendTextMessageWithTranslateTag.xmpp.ts),
 * and createMessageFromXml spreads those onto the top-level message object.
 * Preferring that over the cache removes the timing dependency entirely for
 * the common case, and "Deleted User" becomes what it should have always
 * been: a rare last resort, not "usersSet hasn't loaded yet".
 *
 * Mirrors roomsSlice.ts's enrichMessageAuthor, which does the same
 * self-healing for the message list - this is that same resolution used
 * where a live decision is needed once (e.g. a notification), rather than
 * baked into a message object that re-resolves on every store update.
 */
export const resolveSenderDisplayName = (
  message: Pick<IMessage, 'user'> & {
    fullName?: string;
    senderFirstName?: string;
    senderLastName?: string;
  },
  usersSet: Record<string, RoomMember>
): string => {
  const rawUserId = String(message?.user?.id || '');
  const localUserId = rawUserId.split('@')[0];
  const currentNameRaw = String(message?.user?.name || '').trim();
  // A previously-resolved "Deleted User" is itself a miss sentinel, not a
  // real name - don't let it short-circuit the fallback chain below.
  const currentName = currentNameRaw === 'Deleted User' ? '' : currentNameRaw;

  const dataFullName = String(message?.fullName || '').trim();
  const dataFirst = String(message?.senderFirstName || '').trim();
  const dataLast = String(message?.senderLastName || '').trim();
  const composedFromData = dataFullName || `${dataFirst} ${dataLast}`.trim();

  const usersSetName = createUserNameFromSetUser(usersSet, localUserId);
  const usersSetNameAlt = createUserNameFromSetUser(usersSet, rawUserId);
  const isUsersSetUseful = (name: string) => !!name && name !== 'Deleted User';

  return (
    currentName ||
    (isUsersSetUseful(usersSetName) && usersSetName) ||
    (isUsersSetUseful(usersSetNameAlt) && usersSetNameAlt) ||
    composedFromData ||
    localUserId ||
    rawUserId ||
    'Deleted User'
  );
};
