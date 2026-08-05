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
  ownerKey?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  isVisible?: boolean;
  isPrivate?: boolean;
}
