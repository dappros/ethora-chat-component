import { IAttachment, IMessage } from '../types/types';
import { safeJsonParse } from './safeJson';
import { parseDimension } from './mediaBox';

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
    ...optionalDimensions(source),
    ...optionalLocalUrl(source),
    ownerKey: asOptionalString(source.ownerKey),
    userId: asOptionalString(source.userId),
    createdAt: asOptionalString(source.createdAt),
    updatedAt: asOptionalString(source.updatedAt),
    expiresAt: asOptionalString(source.expiresAt),
    isVisible: asOptionalBoolean(source.isVisible),
    isPrivate: asOptionalBoolean(source.isPrivate),
    ...normalizeUploadState(source),
  };
};

/** Pixel size, only when the source carries a usable one. */
const optionalDimensions = (
  source: Record<string, unknown>
): Pick<IAttachment, 'width' | 'height'> => {
  const width = parseDimension(source.width);
  const height = parseDimension(source.height);
  return {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
};

/** The sender's own blob URL; anything that is not a blob URL is dropped. */
const optionalLocalUrl = (source: Record<string, unknown>): Pick<IAttachment, 'localUrl'> =>
  typeof source.localUrl === 'string' && source.localUrl.startsWith('blob:')
    ? { localUrl: source.localUrl }
    : {};

/**
 * Local upload state rides along on optimistic attachments only; it is
 * never serialised, so a received attachment never carries it.
 */
const normalizeUploadState = (
  source: Record<string, unknown>
): Pick<IAttachment, 'uploadStatus' | 'uploadProgress'> => {
  const status = source.uploadStatus === 'uploading' || source.uploadStatus === 'failed'
    ? source.uploadStatus
    : undefined;
  if (!status) return {};
  const progress =
    typeof source.uploadProgress === 'number' && Number.isFinite(source.uploadProgress)
      ? Math.min(100, Math.max(0, source.uploadProgress))
      : 0;
  return { uploadStatus: status, uploadProgress: progress };
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

/**
 * Maps one object from POST /files/ `results` to the attachment a sent
 * message carries. Field names here follow the API's own spelling
 * (`originalname`, `filename`), not the wire attribute names.
 */
export const toUploadedAttachment = (raw: any): IAttachment => ({
  attachmentId: raw?._id,
  location: raw?.location,
  locationPreview: raw?.locationPreview,
  mimetype: raw?.mimetype,
  originalName: raw?.originalname,
  fileName: raw?.filename,
  size: raw?.size?.toString?.() ?? raw?.size,
  duration: raw?.duration,
  ownerKey: raw?.ownerKey,
  userId: raw?.userId,
  createdAt: raw?.createdAt,
  updatedAt: raw?.updatedAt,
  expiresAt: raw?.expiresAt,
  isVisible: raw?.isVisible,
  isPrivate: raw?.isPrivate,
});

/** Name to show for an attachment, with the URL tail as the last resort. */
export const getAttachmentName = (attachment: IAttachment): string =>
  attachment.originalName ||
  attachment.fileName ||
  attachment.location?.split('/')?.pop() ||
  'MediaFile';
