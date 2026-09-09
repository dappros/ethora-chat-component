import { IMessage, ModalFile } from '../types/types';
import { getAttachmentName, getMessageAttachments } from './attachments';
import { getFileKind } from './fileKind';
import { withoutFileToken } from './secureFileUrl';

/**
 * One navigable entry in the media viewer's gallery.
 *
 * Shaped as a `ModalFile` (plus a render key) on purpose: navigating is just
 * `dispatch(setActiveFile(entry))`, so every downstream consumer - the
 * download action, the secure `?ft=` token treatment, the alt text - keeps
 * reading exactly the fields it read when a single file was opened by hand.
 */
export interface GalleryImage extends ModalFile {
  /** Stable per message+slot, so two identical URLs are still two entries. */
  key: string;
}

/**
 * The gallery the lightbox pages through.
 *
 * Scope, deliberately narrow and honest: **image attachments carried by the
 * messages currently in the store for this room, in chronological order**.
 * That is not "every image ever posted here":
 *
 * - History is paged from MAM. Only what has been loaded so far is here, so
 *   the gallery grows as the user (or the background preloader) pulls older
 *   history in. The counter re-renders with it.
 * - MessageList's render window (120 initial / 60 per step) does NOT bound
 *   this: the window controls how many messages are *mounted*, while the
 *   store keeps every loaded message. So the gallery routinely contains
 *   images that are not currently in the DOM, which is what makes paging
 *   past the top of the viewport work at all.
 * - `useMyFiles` (/v2/files) was the other candidate source and is the wrong
 *   one: that endpoint lists the *caller's own* uploads with no server-side
 *   room filter, so it would show the viewer their own files from other
 *   rooms while hiding every image anybody else posted in this one.
 *
 * Non-images (video, PDF, audio, arbitrary files) are excluded, so opening a
 * PDF simply produces an empty gallery and no navigation chrome.
 */
export const collectRoomImages = (
  messages?: Partial<IMessage>[] | null
): GalleryImage[] => {
  if (!Array.isArray(messages)) return [];

  const images: GalleryImage[] = [];

  messages.forEach((message, messageIndex) => {
    if (!message || message.isDeleted) return;
    // The unread separator is a synthetic row, not a message.
    if (message.id === 'delimiter-new') return;

    getMessageAttachments(message as IMessage).forEach((attachment, slot) => {
      // Empty location = still uploading; there is nothing to open yet.
      if (!attachment.location) return;
      const fileName = getAttachmentName(attachment);
      if (getFileKind(attachment.mimetype, fileName) !== 'image') return;

      images.push({
        key: `${message.id ?? messageIndex}:${slot}`,
        fileName,
        fileURL: attachment.location,
        mimetype: attachment.mimetype || '',
      });
    });
  });

  return images;
};

/**
 * Position of the open file inside the gallery, or -1 when it is not part of
 * it (a PDF, a video, a file opened from the Files panel of another room).
 *
 * Matching is by URL with the secure-file `?ft=` token stripped from both
 * sides: it is the one field every entry point fills in, but the URL that
 * reached the store when the bubble was clicked can already carry a token
 * (they are minted per viewer and expire in about an hour) while the copy
 * read back from the message does not. Comparing the raw strings therefore
 * failed for exactly the secure rooms this feature has to work in.
 *
 * Two posts of the same URL collapse onto the first: a duplicate image is
 * the same picture, so paging to it twice would only look like the arrows
 * were stuck.
 */
export const findGalleryIndex = (
  images: GalleryImage[],
  activeFile?: ModalFile | null
): number => {
  if (!activeFile?.fileURL) return -1;
  const target = withoutFileToken(activeFile.fileURL);
  return images.findIndex(
    (image) => withoutFileToken(image.fileURL) === target
  );
};
