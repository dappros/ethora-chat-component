import { IMessage, RoomMember } from '../types/types';
// From xmppIdShape.ts, NOT xmppUsername.ts: this file is reachable from the
// redux reducer graph (via roomsSlice.ts), and xmppUsername.ts imports
// `store` from roomStore/index.ts - importing it here would create a
// circular dependency back into the module still assembling that store.
import { isOpaqueXmppUserId } from './xmppIdShape';

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
  // real name - don't let it short-circuit the fallback chain below. Same
  // for a raw xmpp id baked in as `user.name` by an earlier, less careful
  // resolution (or by this very function's own tail below, before this
  // fix): once that happens it reads exactly like a real one-word name and
  // would otherwise win here forever, even after a better source (a fresh
  // profile, a `/chats/my` seed) becomes available.
  const currentName =
    currentNameRaw === 'Deleted User' || isOpaqueXmppUserId(currentNameRaw)
      ? ''
      : currentNameRaw;

  const dataFullName = String(message?.fullName || '').trim();
  const dataFirst = String(message?.senderFirstName || '').trim();
  const dataLast = String(message?.senderLastName || '').trim();
  const composedFromData = dataFullName || `${dataFirst} ${dataLast}`.trim();

  const usersSetName = createUserNameFromSetUser(usersSet, localUserId);
  const usersSetNameAlt = createUserNameFromSetUser(usersSet, rawUserId);
  // `createUserNameFromSetUser` itself falls back to echoing the lookup key
  // back when it finds a usersSet entry with no firstName/lastName (a real
  // hit, but a nameless one - e.g. a just-registered profile the backend
  // hasn't finished populating). That echo is indistinguishable from a real
  // one-word name unless we also compare it against the key we looked up -
  // treat it as a miss too, the same as "Deleted User", so we still try
  // composedFromData below instead of showing the raw xmpp id.
  const isUsersSetUseful = (name: string, key: string) =>
    !!name && name !== 'Deleted User' && name !== key;

  // The bare id / full jid are a last resort, and only when they're
  // actually readable - an opaque machine-generated id (see
  // isOpaqueXmppUserId) is worse than the "Deleted User" sentinel itself:
  // it looks like a name, sticks in `message.user.name`, and (before this
  // fix) short-circuited every later resolution attempt via `currentName`
  // above. Drop straight through to the sentinel instead.
  const safeLocalUserId = isOpaqueXmppUserId(localUserId) ? '' : localUserId;
  const safeRawUserId = isOpaqueXmppUserId(rawUserId) ? '' : rawUserId;

  return (
    currentName ||
    (isUsersSetUseful(usersSetName, localUserId) && usersSetName) ||
    (isUsersSetUseful(usersSetNameAlt, rawUserId) && usersSetNameAlt) ||
    composedFromData ||
    safeLocalUserId ||
    safeRawUserId ||
    'Deleted User'
  );
};
