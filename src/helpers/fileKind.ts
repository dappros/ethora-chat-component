/**
 * One place that answers "what do we render for this file?".
 *
 * Before this, every surface (bubble, room list, notification toast, the
 * composer) re-derived the answer from `mimetype` alone with a slightly
 * different set of `startsWith` checks, and none of them looked at the file
 * name. That is why a PDF uploaded as `application/octet-stream` (which our
 * storage does for anything it cannot sniff) ended up in the audio branch.
 */

export type FileKind = 'image' | 'video' | 'audio' | 'pdf' | 'file';

/** Lowercase extension without the dot; '' when the name carries none. */
export const getFileExtension = (name?: string): string => {
  const dotIndex = String(name || '').lastIndexOf('.');
  if (dotIndex < 1) return '';
  return String(name).slice(dotIndex + 1).toLowerCase();
};

/**
 * Matches `application/pdf` plus the variants still in the wild:
 * `application/x-pdf`, `application/acrobat`-style vendor prefixes written
 * as `application/vnd.something+pdf`.
 */
const PDF_MIME = /\/(x-)?[a-z0-9.+-]*pdf$/;

export const isPdfFile = (mimetype?: string, name?: string): boolean => {
  const mime = String(mimetype || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  if (PDF_MIME.test(mime)) return true;
  return getFileExtension(name) === 'pdf';
};

/**
 * SVG is deliberately not an image here. It does not render reliably as a
 * message picture, can be blocked by the host's CSP, and is a script
 * injection vector when opened directly. It is treated as a plain file.
 */
export const isSvgFile = (mimetype?: string, name?: string): boolean => {
  const mime = String(mimetype || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  if (mime === 'image/svg+xml' || mime === 'image/svg') return true;
  const ext = getFileExtension(name);
  return ext === 'svg' || ext === 'svgz';
};

/** True when the file renders as a picture (never for SVG). */
export const isRasterImage = (mimetype?: string, name?: string): boolean =>
  String(mimetype || '').toLowerCase().startsWith('image/') &&
  !isSvgFile(mimetype, name);

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  '3gp': 'video/3gpp',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  amr: 'audio/amr',
  weba: 'audio/webm',
  pdf: 'application/pdf',
};

/**
 * The mimetype a file name's extension stands for, for the pictures, videos,
 * audio and PDFs a bubble can show. Undefined for anything else.
 */
export const inferMimeFromName = (name?: string): string | undefined =>
  EXTENSION_MIME[getFileExtension(String(name || '').split(/[?#]/)[0])];

/** A mimetype that says nothing: empty, or the storage's "could not sniff". */
export const isGenericMime = (mimetype?: string): boolean => {
  const mime = String(mimetype || '').toLowerCase().split(';')[0].trim();
  return !mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream';
};

export const getFileKind = (mimetype?: string, name?: string): FileKind => {
  let mime = String(mimetype || '').toLowerCase();

  if (isSvgFile(mime, name)) return 'file';

  // A mimetype that says nothing (missing, or octet-stream from older
  // clients and the storage's sniffer) is read from the file extension, so a
  // `photo.jpg` is a picture whatever it was labelled.
  if (isGenericMime(mime)) {
    mime = inferMimeFromName(name) ?? mime;
  }

  // PDF first: it is the one type that is regularly mislabelled as
  // octet-stream, and octet-stream is claimed by the audio branch below.
  if (isPdfFile(mime, name)) return 'pdf';

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  // Voice notes recorded in-browser upload as octet-stream. Keeping this
  // fallback preserves that; the PDF check above is what stops it from
  // swallowing documents too.
  if (mime.includes('application/octet-stream')) return 'audio';

  return 'file';
};

export const formatFileSize = (sizeInBytes?: string | number): string => {
  const size =
    typeof sizeInBytes === 'number' ? sizeInBytes : parseInt(String(sizeInBytes ?? ''), 10);

  if (!Number.isFinite(size) || size < 0) {
    return '';
  }

  // One decimal at most: 323.7 KB, 6.8 MB, 2 KB.
  const withUnit = (value: number, unit: string) =>
    `${Number(value.toFixed(1))} ${unit}`;

  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 ** 2) {
    return withUnit(size / 1024, 'KB');
  }
  if (size < 1024 ** 3) {
    return withUnit(size / 1024 ** 2, 'MB');
  }
  return withUnit(size / 1024 ** 3, 'GB');
};

/** Middle-truncates the base name, always keeping the extension visible. */
export const formatFileName = (name: string, maxLength: number): string => {
  const value = String(name || '');
  const dotIndex = value.lastIndexOf('.');
  const extension = dotIndex > 0 ? value.substring(dotIndex) : '';
  const baseName = dotIndex > 0 ? value.substring(0, dotIndex) : value;

  if (baseName.length + extension.length <= maxLength) {
    return value;
  }

  const room = maxLength - extension.length - 3;
  if (room <= 0) {
    return `...${extension}`;
  }

  return `${baseName.substring(0, room)}...${extension}`;
};

/** An animated-picture candidate: image/gif, or a name or URL ending in .gif. */
export const isGifFile = (mimetype?: string, nameOrUrl?: string): boolean => {
  if ((mimetype || '').toLowerCase().split(';')[0].trim() === 'image/gif') return true;
  const path = (nameOrUrl || '').split(/[?#]/)[0].toLowerCase();
  return path.endsWith('.gif');
};
