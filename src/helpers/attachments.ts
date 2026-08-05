import { IAttachment, IMessage } from '../types/types';
import { safeJsonParse } from './safeJson';

/**
 * Hard ceiling on how many attachments we will serialise into a stanza.
 * The composer caps the picker far below this; this is the parser-side
 * guard so a malformed or hostile stanza cannot make us render an
 * unbounded grid.
 */
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

const asOptionalString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value || undefined;
  if (typeof value === 'number') return String(value);
  return undefined;
};

const asOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};

/**
 * Turns one raw wire/API object into an `IAttachment`, or null when there is
 * nothing renderable in it. `location` is allowed to be empty: that is what
 * an optimistic (still-uploading) attachment looks like.
 */
export const normalizeAttachment = (raw: unknown): IAttachment | null => {
  if (!raw || typeof raw !== 'object') return null;

  const source = raw as Record<string, unknown>;
  const location = asOptionalString(source.location) ?? '';
  const originalName =
    asOptionalString(source.originalName) ?? asOptionalString(source.originalname);
  const mimetype = asOptionalString(source.mimetype);
  const fileName = asOptionalString(source.fileName) ?? asOptionalString(source.filename);

  if (!location && !originalName && !mimetype && !fileName) {
    return null;
  }

  return {
    attachmentId: asOptionalString(source.attachmentId) ?? asOptionalString(source._id),
    location,
    locationPreview: asOptionalString(source.locationPreview),
    mimetype,
    originalName,
    fileName,
    size: asOptionalString(source.size),
    duration: asOptionalString(source.duration),
    ownerKey: asOptionalString(source.ownerKey),
    userId: asOptionalString(source.userId),
    createdAt: asOptionalString(source.createdAt),
    updatedAt: asOptionalString(source.updatedAt),
    expiresAt: asOptionalString(source.expiresAt),
    isVisible: asOptionalBoolean(source.isVisible),
    isPrivate: asOptionalBoolean(source.isPrivate),
  };
};

/** Accepts the parsed array, the raw JSON string, or junk. Never throws. */
export const parseAttachments = (raw: unknown): IAttachment[] => {
  const candidate = typeof raw === 'string' ? safeJsonParse<unknown>(raw, []) : raw;
  if (!Array.isArray(candidate)) return [];

  return candidate
    .slice(0, MAX_ATTACHMENTS_PER_MESSAGE)
    .map(normalizeAttachment)
    .filter((item): item is IAttachment => item !== null);
};

/**
 * The wire form: a JSON string on the `<data attachments="...">` attribute.
 * Only the fields a receiver renders are sent - the stanza is already wide
 * and every byte here is duplicated per attachment.
 */
export const serializeAttachments = (attachments: IAttachment[]): string =>
  JSON.stringify(
    attachments.slice(0, MAX_ATTACHMENTS_PER_MESSAGE).map((attachment) => ({
      attachmentId: attachment.attachmentId,
      location: attachment.location,
      locationPreview: attachment.locationPreview,
      mimetype: attachment.mimetype,
      originalName: attachment.originalName,
      fileName: attachment.fileName,
      size: attachment.size,
      duration: attachment.duration,
    }))
  );

/**
 * The only supported way to read a media message's files.
 *
 * Order of truth: the multi-attach payload when present, otherwise the flat
 * legacy fields synthesised into a single attachment. Every message that
 * predates this feature - and every message from a client that does not
 * speak it - takes the second path.
 */
export const getMessageAttachments = (
  message?: Pick<
    IMessage,
    | 'attachments'
    | 'location'
    | 'locationPreview'
    | 'mimetype'
    | 'originalName'
    | 'fileName'
    | 'size'
  > | null
): IAttachment[] => {
  if (!message) return [];

  const parsed = parseAttachments(message.attachments);
  if (parsed.length > 0) return parsed;

  const legacy = normalizeAttachment({
    location: message.location,
    locationPreview: message.locationPreview,
    mimetype: message.mimetype,
    originalName: message.originalName,
    fileName: message.fileName,
    size: message.size,
  });

  return legacy ? [legacy] : [];
};

/** Name to show for an attachment, with the URL tail as the last resort. */
export const getAttachmentName = (attachment: IAttachment): string =>
  attachment.originalName ||
  attachment.fileName ||
  attachment.location?.split('/')?.pop() ||
  'MediaFile';
