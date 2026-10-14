import { IAttachment, LastMessage } from '../types/types';
import { getAttachmentName, getMessageAttachments } from './attachments';
import { getFileKind } from './fileKind';
import { formatDuration } from './mediaBox';
import { getMessageCaption } from './caption';

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
  /** Media of unknown type: a thin backend payload that only says "media". */
  | 'attachment'
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
  /** The caption the sender typed with the files, carried on the message. */
  caption?: unknown;
  duration?: unknown;
  mediaDuration?: unknown;
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
    duration: message.duration,
    mediaDuration: message.mediaDuration,
  });

/**
 * Message ids the SDK's own senders mint: `send-media-message:<uuid>` for an
 * upload. The QA backend's `GET /chats/my` `lastMessage` for a media message
 * carries NOTHING else about the file: no `isMediafile`, no `mimetype`, no
 * `attachments`, just `body: "media"` and this `messageId`.
 */
const MEDIA_ID_PREFIX = 'send-media-message';
const TEXT_ID_PREFIXES = ['send-text-message', 'send-translate-message', 'local'];

/**
 * A thin payload that only says "media": the placeholder body, or the media
 * id prefix. A literal text message "media" is told apart by its text id.
 */
const isPlaceholderMedia = (message: PreviewSource): boolean => {
  const id = String(message.id ?? '');
  if (id.startsWith(MEDIA_ID_PREFIX)) return true;
  if (String(message.body ?? '').trim() !== MEDIA_BODY) return false;
  return !TEXT_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
};

const isFlaggedMedia = (message: PreviewSource): boolean =>
  String(message.isMediafile) === 'true' || isPlaceholderMedia(message);

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
  options: { sealed?: boolean; senderNames?: string[] } = {}
): MediaPreview | undefined => {
  if (!message || message.isDeleted) return undefined;

  const attachments = attachmentsOf(message);
  if (!isFlaggedMedia(message) && attachments.length === 0) return undefined;

  const sealed = options.sealed === true || message.clientEncrypted === 'true';
  // The same rule as the bubble: a carried caption, a caption alias, or a
  // real `body` (older senders put their text there). Never read for a
  // sealed row. `isMedia` because a thin backend `lastMessage` only says it
  // is media by its id.
  const caption = getMessageCaption(message, {
    isMedia: true,
    sealed,
    senderNames: options.senderNames,
  });

  if (attachments.length === 0) {
    // Flagged as media but the payload said nothing more (a thin backend
    // `lastMessage`): a generic file row beats a blank line.
    return { kind: sealed ? 'sealed' : 'attachment', count: 1, caption };
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

/**
 * Which message the room row previews: the newest real message already in the
 * room's `messages[]` (a live stanza or history), else the backend's
 * `lastMessage` seed. Entries with neither text nor media (markers, receipts,
 * state-only stanzas) are skipped.
 */
export const pickPreviewSource = <T extends PreviewSource>(
  messages: T[] | undefined,
  lastMessage?: T | null
): T | undefined => {
  for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
    const m = messages![i];
    if (!m) continue;
    if (m.isDeleted || m.body || m.emoji || hasMediaPreview(m)) return m;
  }
  return lastMessage ?? undefined;
};
