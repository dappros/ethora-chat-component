import { getAttachmentName, getMessageAttachments } from './attachments';
import { isSvgFile } from './fileKind';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * What to call a media message's files when there is no text to show:
 * "Photo", "Video", "Voice message", "File", "3 photos", "2 attachments".
 * Empty when the message carries no file. The kind comes from the normalised
 * attachment, so a file sent with no mimetype is still a photo by its name.
 */
export const getMediaLabel = (
  message: Parameters<typeof getMessageAttachments>[0],
  t: Translate
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
