/**
 * One uploaded file carried by a media message.
 *
 * Historically a media message described exactly one file through flat
 * `IMessage` fields (`location`, `mimetype`, `originalName`, ...). Those
 * fields are still written (they are what every already-shipped client
 * reads), and they now double as attachment #0 of `IMessage.attachments`.
 * Anything past #0 only exists in the `attachments` payload, so old clients
 * degrade to "shows the first file" instead of breaking.
 */
export interface IAttachment {
  /** `_id` returned by POST /files/ - stable per upload, used as a render key. */
  attachmentId?: string;
  /** Canonical file URL. */
  location: string;
  /** Server-side generated preview (images always, other types sometimes). */
  locationPreview?: string;
  mimetype?: string;
  /** Name the user picked. */
  originalName?: string;
  /** Name on the storage side. */
  fileName?: string;
  /** Bytes, as a string - that is how it travels on the wire. */
  size?: string;
  duration?: string;
  /** Natural pixel size, when the storage recorded it. Sizes the solo preview box. */
  width?: number;
  height?: number;
  ownerKey?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  isVisible?: boolean;
  isPrivate?: boolean;
  /**
   * Local-only state of an outgoing attachment, set by the sender while its
   * message is still being sent. Never written to the wire.
   *   uploading - the file is going up (or every file is up and the message
   *               is waiting on its siblings); `uploadProgress` is 0 to 100.
   *   failed    - this file did not upload; the message is held until it
   *               is retried.
   */
  uploadStatus?: 'uploading' | 'failed';
  uploadProgress?: number;
  /**
   * Local-only `blob:` URL of the sender's own picture, so an outgoing image
   * shows at once and stays on screen while the server copy loads. Never
   * written to the wire.
   */
  localUrl?: string;
}
