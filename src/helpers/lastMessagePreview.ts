import { IAttachment, LastMessage } from '../types/types';
import { getAttachmentName, getMessageAttachments } from './attachments';
import { getFileKind } from './fileKind';
import { formatDuration } from './mediaBox';

/**
 * What the room list draws for a media last message.
 *
 * One derivation for every source of a last message: the live stanza that
 * updates roomsSlice, the history loaded from MAM, and the flattened
 * `lastMessage` the backend embeds in `GET /chats/my`. All three reach the row
 * as the same loose message object, and since multi-attachment messages the
 * file fields may sit in `attachments` only, with no top level `location` or
 * `mimetype`, so the row reads through getMessageAttachments like the bubble.
 */
export type MediaPreviewKind =
  | 'image'
  | 'video'
  | 'voice'
  | 'audio'
  | 'file'
  | 'sealed';

export interface MediaPreview {
  kind: MediaPreviewKind;
  /** How many attachments the message carries (at least 1). */
  count: number;
  /** Thumbnail source, before the viewer's file token is appended. */
  thumbUrl?: string;
  /** The single file's name, for the file kind. */
  fileName?: string;
  /** "0:12" for a voice message or audio file, when the duration is known. */
  durationText?: string;
  /** The text the sender typed next to the media, if any. */
  caption?: string;
}

/** The placeholder body media messages are sent with. */
const MEDIA_BODY = 'media';

type PreviewSource = Partial<LastMessage> & {
  attachments?: unknown;
  fileName?: string;
  location?: string;
};

const attachmentsOf = (message: PreviewSource): IAttachment[] =>
  getMessageAttachments({
    attachments: message.attachments as IAttachment[] | undefined,
    location: message.location,
    locationPreview: message.locationPreview,
    mimetype: message.mimetype,
    originalName: message.originalName,
    fileName: message.fileName ?? message.filename,
    size: message.size,
  });

const isFlaggedMedia = (message: PreviewSource): boolean =>
  String(message.isMediafile) === 'true';

const kindOf = (attachment: IAttachment): MediaPreviewKind => {
  const name = getAttachmentName(attachment);
  const kind = getFileKind(attachment.mimetype, name);
  if (kind === 'image' || kind === 'video') return kind;
  if (kind === 'audio') {
    // Recorded voice notes upload as octet-stream or carry a "voice" name;
    // anything else audio is a music or sound file.
    const mime = String(attachment.mimetype || '').toLowerCase();
    return mime.includes('application/octet-stream') || /voice/i.test(name)
      ? 'voice'
      : 'audio';
  }
  return 'file';
};

/** True when the last message should render as media rather than text. */
export const hasMediaPreview = (message?: PreviewSource | null): boolean =>
  Boolean(message) &&
  !message?.isDeleted &&
  (isFlaggedMedia(message as PreviewSource) ||
    attachmentsOf(message as PreviewSource).length > 0);

/**
 * `sealed` is true for an e2ee room or a message flagged `clientEncrypted`.
 * Sealed content never gets a thumbnail: the server holds ciphertext, so the
 * row shows the icon and the label only.
 */
export const deriveMediaPreview = (
  message?: PreviewSource | null,
  options: { sealed?: boolean } = {}
): MediaPreview | undefined => {
  if (!message || message.isDeleted) return undefined;

  const attachments = attachmentsOf(message);
  if (!isFlaggedMedia(message) && attachments.length === 0) return undefined;

  const sealed = options.sealed === true || message.clientEncrypted === 'true';
  const body = String(message.body ?? '').trim();
  const caption =
    !sealed && body && body.toLowerCase() !== MEDIA_BODY ? body : undefined;

  if (attachments.length === 0) {
    // Flagged as media but the payload said nothing more (a thin backend
    // `lastMessage`): a generic file row beats a blank line.
    return { kind: sealed ? 'sealed' : 'file', count: 1, caption };
  }

  const first = attachments[0];
  const kinds = attachments.map(kindOf);
  // A mixed album reads as plain "files"; a pure one keeps its own kind.
  const kind: MediaPreviewKind = kinds.every((k) => k === kinds[0])
    ? kinds[0]
    : 'file';

  const preview: MediaPreview = {
    kind,
    count: attachments.length,
    caption,
  };

  if (!sealed) {
    if (kind === 'image') {
      preview.thumbUrl =
        first.localUrl || first.locationPreview || first.location || undefined;
    } else if (kind === 'video') {
      // A video's own URL is not an image; only a poster can be drawn.
      preview.thumbUrl = first.locationPreview || undefined;
    }
  }

  if (!sealed && kind === 'file' && attachments.length === 1) {
    preview.fileName = getAttachmentName(first);
  }
  if ((kind === 'voice' || kind === 'audio') && attachments.length === 1) {
    preview.durationText = formatDuration(first.duration) || undefined;
  }

  return preview;
};
