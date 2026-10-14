import { IAttachment, IMessage } from '../types/types';
import { safeJsonParse } from './safeJson';
import { parseDimension } from './mediaBox';
import { repairFilenameEncoding } from './repairFilenameEncoding';
import { inferMimeFromName, isGenericMime } from './fileKind';

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

/** A file name from the wire/API, with UTF-8-read-as-Latin-1 mojibake undone. */
const asOptionalFileName = (value: unknown): string | undefined => {
  const name = asOptionalString(value);
  return name === undefined ? undefined : repairFilenameEncoding(name);
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
    asOptionalFileName(source.originalName) ?? asOptionalFileName(source.originalname);
  const rawMimetype = asOptionalString(source.mimetype);
  const fileName = asOptionalFileName(source.fileName) ?? asOptionalFileName(source.filename);
  const duration =
    asOptionalString(source.duration) ?? asOptionalString(source.mediaDuration);
  const mimetype = resolveLegacyMimetype(rawMimetype, {
    names: [originalName, fileName, urlPath(location)],
    duration,
  });

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
    duration,
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

/** The path part of a URL (no query or fragment), for reading an extension off it. */
const urlPath = (url: string): string | undefined =>
  url ? url.split(/[?#]/)[0] : undefined;

/**
 * Older clients and the storage send media with no `mimetype`, or with the
 * "could not sniff" `application/octet-stream`. The extension of any name the
 * file carries tells which picture, video, audio or PDF it is. A nameless or
 * extensionless file with a duration is a recorded voice note (browsers upload
 * those as a `blob`), which is exactly what octet-stream renders as.
 */
const resolveLegacyMimetype = (
  mimetype: string | undefined,
  hints: { names: Array<string | undefined>; duration?: string }
): string | undefined => {
  if (!isGenericMime(mimetype)) return mimetype;
  const hasDuration = Number.parseFloat(hints.duration ?? '') > 0;
  // A recorded note keeps its generic type: browsers upload it as a nameless
  // `blob` (and storage may add a `.webm` to the stored name, which is audio
  // here, not video). Only a name that says what it is overrides that.
  if (hasDuration && !inferMimeFromName(hints.names[0])) return mimetype ?? 'application/octet-stream';
  for (const name of hints.names) {
    const inferred = inferMimeFromName(name);
    if (inferred) return inferred;
  }
  return mimetype;
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
  > & { duration?: unknown; mediaDuration?: unknown } | null
): IAttachment[] => {
  if (!message) return [];

  const parsed = parseAttachments(message.attachments);
  if (parsed.length > 0) return parsed;

  // Legacy clients may pack several files into the flat fields as a
  // comma separated list of URLs; the other flat fields then list one value
  // each, in the same order, or one value for all.
  const locations = splitUrlList(message.location);
  if (locations.length > 1) {
    const previews = splitUrlList(message.locationPreview);
    const mimetypes = splitList(message.mimetype);
    const names = splitList(message.originalName);
    return locations
      .slice(0, MAX_ATTACHMENTS_PER_MESSAGE)
      .map((location, index) =>
        normalizeAttachment({
          location,
          locationPreview: previews.length === locations.length ? previews[index] : undefined,
          mimetype: pickNth(mimetypes, index, locations.length),
          originalName: pickNth(names, index, locations.length),
          size: undefined,
        })
      )
      .filter((item): item is IAttachment => item !== null);
  }

  const legacy = normalizeAttachment({
    location: message.location,
    locationPreview: message.locationPreview,
    mimetype: message.mimetype,
    originalName: message.originalName,
    fileName: message.fileName,
    size: message.size,
    duration: message.duration,
    mediaDuration: message.mediaDuration,
  });

  return legacy ? [legacy] : [];
};

/** "https://a/x.jpg, https://a/y.jpg" -> two URLs. A single URL stays whole, commas and all. */
const splitUrlList = (value: unknown): string[] =>
  typeof value === 'string' && /,\s*https?:\/\//i.test(value)
    ? value.split(/,\s*(?=https?:\/\/)/i).map((item) => item.trim()).filter(Boolean)
    : typeof value === 'string' && value
      ? [value]
      : [];

const splitList = (value: unknown): string[] =>
  typeof value === 'string' && value ? value.split(',').map((item) => item.trim()) : [];

/** The nth entry of a parallel list, or its only entry when it is shared by all. */
const pickNth = (list: string[], index: number, total: number): string | undefined =>
  list.length === total ? list[index] : list.length === 1 ? list[0] : undefined;

/**
 * True when the message carries a file: flagged `isMediafile`, or (older
 * senders that never set the flag) with a real file URL or attachment. The
 * one test every surface uses for "is this a media bubble".
 */
export const isMediaMessage = (
  message?:
    | (Partial<Pick<IMessage, 'isDeleted' | 'isMediafile' | 'attachments'>> & {
        location?: unknown;
        mimetype?: unknown;
        originalName?: unknown;
        fileName?: unknown;
        locationPreview?: unknown;
      })
    | null
): boolean => {
  if (!message || message.isDeleted) return false;
  if (String(message.isMediafile) === 'true') return true;
  return getMessageAttachments(message as never).some(
    (attachment) => Boolean(attachment.location)
  );
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
  originalName:
    typeof raw?.originalname === 'string'
      ? repairFilenameEncoding(raw.originalname)
      : raw?.originalname,
  fileName:
    typeof raw?.filename === 'string'
      ? repairFilenameEncoding(raw.filename)
      : raw?.filename,
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
