import type { IAttachment, IMessage } from '../types/types';
import { getAttachmentName } from './attachments';
import { getFileKind } from './fileKind';

/**
 * Trust & Safety, sending side: the upload result of a flagged file carries
 * `sensitive: true` and `sensitiveCategory`. A message is flagged when any of
 * its files is; the first flagged file names the category.
 */
export const sensitiveFlagsFromUploads = (
  results: Array<Record<string, unknown> | undefined | null>
): { isSensitive: 'true'; sensitiveCategory?: string } | undefined => {
  const flagged = results.find(
    (result) => result?.sensitive === true || result?.sensitive === 'true'
  );
  if (!flagged) return undefined;
  const category =
    typeof flagged.sensitiveCategory === 'string' && flagged.sensitiveCategory.trim()
      ? flagged.sensitiveCategory.trim()
      : undefined;
  return { isSensitive: 'true', ...(category ? { sensitiveCategory: category } : {}) };
};

/** The receiving side: `<data isSensitive="true">`, or `true` on a local copy. */
export const isSensitiveMessage = (
  message?: Pick<IMessage, 'isSensitive'> | null
): boolean => message?.isSensitive === true || message?.isSensitive === 'true';

/**
 * The file to ask the server about before revealing: the first picture or
 * video (that is what the age gate protects), else the first file with a URL.
 */
export const pickProbeAttachment = (
  attachments: IAttachment[]
): IAttachment | undefined => {
  const withUrl = attachments.filter((attachment) => Boolean(attachment.location));
  return (
    withUrl.find((attachment) => {
      const kind = getFileKind(attachment.mimetype, getAttachmentName(attachment));
      return kind === 'image' || kind === 'video';
    }) ?? withUrl[0]
  );
};

/** The image the cover draws: the server-blurred preview of the first picture or video. */
export const pickCoverPreview = (attachments: IAttachment[]): string | undefined =>
  attachments.find((attachment) => Boolean(attachment.locationPreview))?.locationPreview;
