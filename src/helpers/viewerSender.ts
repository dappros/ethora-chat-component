import { isOpaqueXmppUserId, toLocalPart } from './xmppIdShape';

/** What the media viewer knows about a sender, however thin. */
export interface ViewerSenderInput {
  id?: string;
  username?: string;
  /** `message.user.name`, which carries the display name for many senders. */
  name?: string;
  firstName?: string;
  lastName?: string;
  photo?: string;
}

interface DirectoryEntry {
  firstName?: string;
  lastName?: string;
  profileImage?: string;
}

interface OwnProfile extends DirectoryEntry {
  xmppUsername?: string;
  name?: string;
}

export interface ResolveViewerSenderOptions {
  sender?: ViewerSenderInput | null;
  /** `rooms.usersSet`, keyed by the xmpp username. */
  usersSet?: Record<string, DirectoryEntry | undefined>;
  /** The signed-in user, for their own messages. */
  me?: OwnProfile | null;
  /** Only used for a 1:1 room, where the room is named after the peer. */
  peerRoomName?: string;
}

export interface ResolvedViewerSender {
  /** Empty when nobody could be named. The header then omits the name line. */
  name: string;
  photo?: string;
}

const clean = (value?: string | null): string => String(value ?? '').trim();

const fullName = (entry?: DirectoryEntry | null): string =>
  [clean(entry?.firstName), clean(entry?.lastName)].filter(Boolean).join(' ');

/** A name a person could read: not empty, not a 24-char hex id. */
const readable = (value?: string | null): string => {
  const text = clean(value);
  return text && !isOpaqueXmppUserId(text) ? text : '';
};

/**
 * Resolves the sender shown in the viewer header. The order is the one the
 * message bubble uses, with the signed-in user's own profile as the answer for
 * their own messages (an own optimistic message often has no name on it):
 *
 *   first + last on the message, the message's own `name`, the profile in
 *   `usersSet`, the signed-in user's profile (own messages), the username
 *   before the `@`, and for a 1:1 room the room's name.
 *
 * Never returns a placeholder: when nothing is known `name` is '' and the
 * caller draws a neutral glyph rather than initials.
 */
export const resolveViewerSender = ({
  sender,
  usersSet,
  me,
  peerRoomName,
}: ResolveViewerSenderOptions): ResolvedViewerSender => {
  if (!sender) return { name: '' };

  const locals = [sender.username, sender.id]
    .map((value) => toLocalPart(clean(value)))
    .filter(Boolean);
  const directory = locals
    .map((local) => usersSet?.[local])
    .find((entry) => entry && (fullName(entry) || entry.profileImage));

  const myLocal = toLocalPart(clean(me?.xmppUsername));
  const isOwn = Boolean(myLocal) && locals.includes(myLocal);

  const name =
    fullName(sender) ||
    readable(sender.name) ||
    fullName(directory) ||
    (isOwn ? fullName(me) || readable(me?.name) : '') ||
    locals.map(readable).find(Boolean) ||
    readable(peerRoomName) ||
    '';

  const photo =
    clean(sender.photo) ||
    clean(directory?.profileImage) ||
    (isOwn ? clean(me?.profileImage) : '') ||
    undefined;

  return { name, photo };
};
