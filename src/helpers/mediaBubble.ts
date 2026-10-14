import { IAttachment } from '../types/types';
import { getAttachmentName } from './attachments';
import { getFileKind } from './fileKind';

/**
 * How a message's files share one column:
 *  - album: two or more pictures or videos, one grid; cards stretch to it.
 *  - solo: one picture or video; the block shrink-wraps it (at most the media
 *    width) and any cards stretch to that.
 *  - files: documents only; the media width, capped so a lone card is no bar.
 *  - plain: voice notes only, which keep their own width.
 */
export type MediaBlockMode = 'album' | 'solo' | 'files' | 'plain';

export interface AttachmentItem {
  attachment: IAttachment;
  /** Position in the message's attachments, used for retry. */
  index: number;
}

export interface AttachmentPartition {
  /** Pictures and videos rendered as one album grid (empty for a lone one). */
  tiles: AttachmentItem[];
  /** Everything else, rendered one after another below the grid. */
  rows: AttachmentItem[];
}

const isVisualKind = (kind: string) => kind === 'image' || kind === 'video';

export const attachmentKind = (attachment: IAttachment) =>
  getFileKind(attachment.mimetype, getAttachmentName(attachment));

/**
 * Splits a message's files into the album and the rows below it. Pictures and
 * videos always come first, in the order they were picked; the remaining files
 * (documents, svg, pdf, audio) follow, also in their picked order. A lone
 * picture is not an album: it stays a row, but it still leads the message.
 */
export const partitionAttachments = (
  attachments: IAttachment[]
): AttachmentPartition => {
  const media: AttachmentItem[] = [];
  const others: AttachmentItem[] = [];
  attachments.forEach((attachment, index) => {
    const item = { attachment, index };
    if (isVisualKind(attachmentKind(attachment))) media.push(item);
    else others.push(item);
  });
  if (media.length < 2) {
    return { tiles: [], rows: [...media, ...others] };
  }
  return { tiles: media, rows: others };
};

/** The block mode for a message's files, from the partition it renders. */
export const getMediaBlockMode = (attachments: IAttachment[]): MediaBlockMode => {
  const { tiles, rows } = partitionAttachments(attachments);
  if (tiles.length > 0) return 'album';
  const kinds = rows.map((item) => attachmentKind(item.attachment));
  if (kinds.some(isVisualKind)) return 'solo';
  if (kinds.some((kind) => kind !== 'audio')) return 'files';
  return 'plain';
};

/**
 * Whether the time can sit as a glass pill over the media (Telegram style):
 * only when the bubble is pictures and videos and nothing else. A caption or
 * any card or audio row puts the time on its own line at the bottom right.
 */
export const usesMediaOverlayTime = (
  attachments: IAttachment[],
  options: { hasCaption?: boolean } = {}
): boolean => {
  if (options.hasCaption) return false;
  if (attachments.length === 0) return false;
  return attachments.every((attachment) => isVisualKind(attachmentKind(attachment)));
};
