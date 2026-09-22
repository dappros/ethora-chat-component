import { IMessage, IRoom } from '../types/types';

export interface FileMessageMatch {
  roomJID: string;
  messageId: string;
}

// Minimal shape of what we need from an ApiFile - kept narrow so this stays
// usable from both the real ApiFile type and test fixtures.
export interface DeletableFileRef {
  _id: string;
  roomName?: string;
  location?: string;
}

// Not `IAttachment` itself: that type requires `location`, but the
// single-attachment wire shape (message.location) is optional on IMessage,
// and this needs to accept both.
interface AttachmentRef {
  attachmentId?: string;
  location?: string;
}

const attachmentMatchesFile = (
  attachment: AttachmentRef | undefined,
  file: DeletableFileRef
): boolean => {
  if (!attachment) return false;
  if (file._id && attachment.attachmentId && attachment.attachmentId === file._id) {
    return true;
  }
  if (file.location && attachment.location && attachment.location === file.location) {
    return true;
  }
  return false;
};

const messageMatchesFile = (message: IMessage, file: DeletableFileRef): boolean => {
  if (message.isDeleted) return false;

  if (message.attachments && message.attachments.length > 0) {
    return message.attachments.some((attachment) =>
      attachmentMatchesFile(attachment, file)
    );
  }

  // Older/single-attachment wire shape: the file reference lives on the
  // message itself rather than in an `attachments` array.
  return attachmentMatchesFile(
    { attachmentId: message.attachmentId, location: message.location },
    file
  );
};

/**
 * Finds every locally loaded message that carries the given file, so
 * deleting a file from the Files panel can also tombstone its chat
 * message(s) instead of leaving a broken-image bubble behind.
 *
 * `file.roomName` is checked first: sent-media messages stamp `attachmentId`
 * on the message (see useSendMessage.tsx / sendMediaMessage.xmpp.ts) with
 * the same id the backend gives the file, and the Files API's `roomName`
 * field actually holds the room's JID (see FilesList.tsx / bug 3), so most
 * of the time the right room is known outright. When that doesn't resolve
 * anything - a different backend shape, or the id genuinely isn't on the
 * message - every locally loaded room is searched by attachment location as
 * a fallback, since a matching URL is still a correct match.
 */
export const findMessagesForFile = (
  rooms: Record<string, IRoom>,
  file: DeletableFileRef
): FileMessageMatch[] => {
  const matches: FileMessageMatch[] = [];

  const searchRoom = (roomJID: string) => {
    const room = rooms[roomJID];
    if (!room?.messages) return;
    room.messages.forEach((message) => {
      if (messageMatchesFile(message, file)) {
        matches.push({ roomJID, messageId: message.id });
      }
    });
  };

  if (file.roomName && rooms[file.roomName]) {
    searchRoom(file.roomName);
  }

  if (matches.length === 0) {
    Object.keys(rooms).forEach((roomJID) => {
      if (roomJID === file.roomName) return;
      searchRoom(roomJID);
    });
  }

  return matches;
};
