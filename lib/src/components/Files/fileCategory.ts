import { ApiFile } from '../../types/types';
import { isSvgFile } from '../../helpers/fileKind';

export type FileCategory = 'media' | 'documents' | 'audio';

/**
 * Category derivation for the filter chips - purely mimetype-driven since
 * that is the one field the backend always sends alongside originalname.
 * image/* and video/* both live under "Media" (they share the grid layout
 * with thumbnails); audio/* gets its own chip; everything else falls back
 * to "Documents".
 */
export function getFileCategory(
  mimetype?: string | null,
  name?: string | null
): FileCategory {
  const type = (mimetype || '').toLowerCase();
  if (isSvgFile(type, name || undefined)) return 'documents';
  if (type.startsWith('image/') || type.startsWith('video/')) return 'media';
  if (type.startsWith('audio/')) return 'audio';
  return 'documents';
}

export function isPreviewable(
  file: Pick<ApiFile, 'mimetype'> & { originalname?: string }
): boolean {
  const type = (file.mimetype || '').toLowerCase();
  if (isSvgFile(type, file.originalname)) return false;
  return (
    type.startsWith('image/') ||
    type.startsWith('video/') ||
    type === 'application/pdf'
  );
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Human-readable byte size, e.g. formatBytes(1536) -> "1.5 KB". */
export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '0 B';

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1
  );
  const value = bytes / Math.pow(1024, exponent);
  const rounded = exponent === 0 ? value.toFixed(0) : value.toFixed(1);

  return `${rounded} ${UNITS[exponent]}`;
}
