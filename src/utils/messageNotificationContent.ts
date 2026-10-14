// What a browser/OS notification for an incoming message says, and whether it
// should be shown at all. Pure: every input is passed in, so the same rules
// serve the live XMPP path, the foreground push path and the tests.
import { IMessage } from '../types/models/message.model';
import { IRoom, RoomMember } from '../types/models/room.model';
import { getAttachmentName, getMessageAttachments } from '../helpers/attachments';
import { isSvgFile } from '../helpers/fileKind';
import { resolveSenderDisplayName } from '../helpers/createUserNameFromSetUser';
import { isOpaqueXmppUserId, toLocalPart } from '../helpers/xmppIdShape';
import { interpolate, resolveStringTable } from '../i18n/strings';
import { isCurrentUserMessage } from './notificationPolicy';
import { getMessageCaption } from '../helpers/caption';

export const MAX_NOTIFICATION_BODY_LENGTH = 120;

// The text the backend push and the service worker fall back to when they do
// not know the message; it is never a real message body.
const GENERIC_BODY_RE = /^\s*you have a new message\.?\s*$/i;

export interface NotificationContent {
  title: string;
  body: string;
  /** One per room, so a burst in the same room collapses into one entry. */
  tag: string;
  roomJID: string;
  messageId: string;
}

export interface NotificationContentInput {
  message: IMessage;
  roomJID: string;
  room?: IRoom | null;
  usersSet?: Record<string, RoomMember>;
  currentXmppUsername?: string;
  activeRoomJID?: string | null;
  tabVisible: boolean;
  locale?: string | null;
  strings?: Record<string, string> | null;
  /** Names the caller already has (toast args); never trusted blindly. */
  senderNameHint?: string;
  roomNameHint?: string;
}

/** A name a person would recognise: not empty, not the "Deleted User" miss, not an opaque id. */
const readableName = (value: unknown): string => {
  const name = String(value ?? '').trim();
  if (!name || name === 'Deleted User') return '';
  if (isOpaqueXmppUserId(toLocalPart(name))) return '';
  return name;
};

export const resolveNotificationSenderName = (
  message: IMessage,
  usersSet: Record<string, RoomMember> = {},
  room?: IRoom | null,
  hint?: string
): string => {
  const fromProfile = readableName(resolveSenderDisplayName(message, usersSet));
  if (fromProfile) return fromProfile;

  const localId = toLocalPart(String(message?.user?.id || ''));
  const member = localId
    ? room?.members?.find((m) => toLocalPart(m.xmppUsername || m.jid) === localId)
    : undefined;
  const fromMember = readableName(
    `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || member?.name
  );
  return fromMember || readableName(hint);
};

export const resolveNotificationRoomName = (
  roomJID: string,
  room?: IRoom | null,
  hint?: string
): string => {
  const local = toLocalPart(roomJID);
  const pick = (value: unknown) => {
    const name = readableName(value);
    return name && name !== local ? name : '';
  };
  return pick(room?.name) || pick(room?.title) || pick(hint);
};

const truncate = (text: string): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_NOTIFICATION_BODY_LENGTH
    ? `${clean.slice(0, MAX_NOTIFICATION_BODY_LENGTH - 1).trimEnd()}…`
    : clean;
};

const attachmentLabel = (
  message: IMessage,
  t: (key: string, vars?: Record<string, string | number>) => string
): string => {
  const attachments = getMessageAttachments(message);
  if (attachments.length === 0) return '';
  const kindOf = (mime?: string, name?: string) => {
    const m = String(mime || '').toLowerCase();
    if (isSvgFile(mime, name)) return 'file';
    if (m.startsWith('image/')) return 'photo';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    return 'file';
  };
  const kinds = new Set(attachments.map((a) => kindOf(a.mimetype, getAttachmentName(a))));
  if (attachments.length > 1) {
    if (kinds.size === 1 && kinds.has('photo')) {
      return t('notification.photos', { count: attachments.length });
    }
    return t('notification.attachments', { count: attachments.length });
  }
  const [kind] = Array.from(kinds);
  return t(`notification.${kind}`);
};

export const getNotificationTag = (roomJID: string): string =>
  roomJID ? `ethora-room-${toLocalPart(roomJID)}` : 'ethora-notification';

/**
 * Returns what to show, or null when this message must not raise an alert:
 * own messages, system/receipt/typing stanzas (nothing to say), muted rooms,
 * and the open room while the tab is visible.
 */
export const buildNotificationContent = (
  input: NotificationContentInput
): NotificationContent | null => {
  const { message, roomJID, room, usersSet, tabVisible } = input;
  if (!message) return null;

  if (message.isSystemMessage === 'true') return null;
  if (isCurrentUserMessage(message.user?.id, input.currentXmppUsername)) return null;
  if (room?.muted) return null;
  if (tabVisible && !!roomJID && input.activeRoomJID === roomJID) return null;

  const table = resolveStringTable(input.locale, input.strings);
  const t = (key: string, vars?: Record<string, string | number>) =>
    interpolate(table[key] ?? key, vars);

  const rawBody = typeof message.body === 'string' ? message.body.trim() : '';
  const label = attachmentLabel(message, t);
  // A stanza with neither text nor a file (chat state, receipt, marker) says
  // nothing a person needs to be told about.
  if (!rawBody && !label) return null;

  // In an E2EE room the notification centre outlives the page and sits
  // outside the app's own protections, so it never carries message content,
  // only that something arrived. (An undecryptable placeholder body is
  // covered by the same rule.)
  const generic = !!room?.e2ee || GENERIC_BODY_RE.test(rawBody);
  // A media message's caption is its text: "Photo, look at this". Never
  // shown for an e2ee room, where the notification stays generic.
  const caption = getMessageCaption(message);
  const text = generic
    ? t('notification.newMessage')
    : caption
      ? label
        ? `${label}, ${truncate(caption)}`
        : truncate(caption)
      : label || truncate(rawBody);

  const senderName = resolveNotificationSenderName(
    message,
    usersSet,
    room,
    input.senderNameHint
  );
  const roomName = resolveNotificationRoomName(roomJID, room, input.roomNameHint);
  const isDirect = room?.type === 'private';

  let title: string;
  let body: string;
  if (isDirect) {
    title = senderName || roomName || t('notification.newMessage');
    body = text;
  } else {
    title = roomName || senderName || t('notification.newMessage');
    // The sender prefix only helps when the title is the room, not the sender.
    body = senderName && roomName ? `${senderName}: ${text}` : text;
  }

  return {
    title,
    body,
    tag: getNotificationTag(roomJID),
    roomJID,
    messageId: String(message.id || ''),
  };
};
