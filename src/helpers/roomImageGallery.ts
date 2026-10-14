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
export interface GallerySender {
  id?: string;
  username?: string;
  /** The message's own display name, when it has one. */
  name?: string;
  firstName?: string;
  lastName?: string;
  /** Profile photo URL, when the sender has one. */
  photo?: string;
}

export interface GalleryImage extends ModalFile {
  /** What the entry renders as. Images zoom; videos play. */
  kind: 'image' | 'video';
  /** Stable per message+slot, so two identical URLs are still two entries. */
  key: string;
  /** Low-resolution copy shown blurred while the full image loads. */
  previewURL?: string;
  /** Message timestamp (ISO), shown in the viewer's header. */
  date?: string;
  /** Who posted it; the viewer header shows their name and avatar. */
  sender?: GallerySender;
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
/** The sender fields the viewer header needs, or undefined for no sender. */
export const senderFromMessage = (
  message?: Partial<IMessage> | null
): GallerySender | undefined =>
  message?.user
    ? {
        id: message.user.id,
        username: message.user.username,
        name: message.user.name,
        firstName: message.user.firstName,
        lastName: message.user.lastName,
        photo: message.user.profileImage || undefined,
      }
    : undefined;

/** ISO date string for a message, as the viewer header wants it. */
export const isoDateFromMessage = (
  message?: Partial<IMessage> | null
): string | undefined =>
  message?.date instanceof Date ? message.date.toISOString() : message?.date;

export const collectRoomImages = (
  messages?: Partial<IMessage>[] | null
): GalleryImage[] => collectRoomMedia(messages, ['image']);

/**
 * Same walk as `collectRoomImages`, but the viewer's gallery also pages
 * through videos, so an album of photos and clips opens as one sequence.
 * PDFs, audio and other files are still excluded.
 */
export const collectRoomMedia = (
  messages?: Partial<IMessage>[] | null,
  kinds: Array<'image' | 'video'> = ['image', 'video']
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
      const kind = getFileKind(attachment.mimetype, fileName);
      if (kind !== 'image' && kind !== 'video') return;
      if (!kinds.includes(kind)) return;

      images.push({
        kind,
        key: `${message.id ?? messageIndex}:${slot}`,
        fileName,
        fileURL: attachment.location,
        mimetype: attachment.mimetype || '',
        previewURL: attachment.locationPreview || undefined,
        date: isoDateFromMessage(message),
        sender: senderFromMessage(message),
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

/**
 * Builds gallery entries from the file list a caller handed over with the
 * open request (an album grid passes all of its tiles). Items without a
 * location, or that are neither image nor video, are dropped.
 */
export const galleryFromFiles = (
  files?: ModalFile[] | null
): GalleryImage[] => {
  if (!Array.isArray(files)) return [];
  const entries: GalleryImage[] = [];
  files.forEach((file, slot) => {
    if (!file?.fileURL) return;
    const kind = getFileKind(file.mimetype, file.fileName);
    if (kind !== 'image' && kind !== 'video') return;
    entries.push({
      kind,
      key: `album:${slot}`,
      fileName: file.fileName,
      fileURL: file.fileURL,
      mimetype: file.mimetype || '',
      previewURL: file.previewURL,
      date: file.date,
      sender: file.sender,
    });
  });
  return entries;
};
