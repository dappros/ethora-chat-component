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

export const getFileKind = (mimetype?: string, name?: string): FileKind => {
  const mime = String(mimetype || '').toLowerCase();

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

  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 ** 2) {
    return `${(size / 1024).toFixed(2)} KB`;
  }
  if (size < 1024 ** 3) {
    return `${(size / 1024 ** 2).toFixed(2)} MB`;
  }
  return `${(size / 1024 ** 3).toFixed(2)} GB`;
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
