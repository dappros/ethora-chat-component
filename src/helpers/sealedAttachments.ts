// Turning a sealed attachment back into something the renderers can show.
//
// What arrives over XMPP for an e2ee attachment is a URL to opaque bytes plus
// a key that came in the encrypted <body> (see e2ee/fileEnvelope.ts and
// sendMediaMessage.xmpp.ts). Nothing downstream knows about any of that: the
// tile renderers read `location`, `mimetype` and the attachment's name. So the
// job here is to fetch, open, and hand back an attachment shaped exactly like
// an ordinary one - with a `blob:` location and the real type and filename
// recovered from inside the seal.

import { IAttachment } from '../types/types';
import { openSealedFile, type FileEnvelopeMeta } from '../e2ee/fileEnvelope';
import { withoutFileToken } from './secureFileUrl';

export interface OpenedAttachment {
  objectUrl: string;
  meta: FileEnvelopeMeta;
}

// Object URLs live until revoked, and the same attachment is re-opened on
// every scroll-back, so they are cached. Keyed WITHOUT the fileToken: the
// token is per-viewer and rotates roughly hourly, and a rotation must not
// silently turn into a second copy of the same file.
const MAX_CACHED = 48;
const cache = new Map<string, OpenedAttachment>();
const inFlight = new Map<string, Promise<OpenedAttachment>>();

function remember(key: string, value: OpenedAttachment): OpenedAttachment {
  cache.set(key, value);
  while (cache.size > MAX_CACHED) {
    // Map iterates in insertion order, so the first key is the oldest.
    const oldest = cache.keys().next();
    if (oldest.done) break;
    const evicted = cache.get(oldest.value);
    cache.delete(oldest.value);
    if (evicted) URL.revokeObjectURL(evicted.objectUrl);
  }
  return value;
}

/** Drops every cached blob. Call on logout so decrypted files do not outlive the session. */
export function clearSealedAttachmentCache(): void {
  cache.forEach((entry) => URL.revokeObjectURL(entry.objectUrl));
  cache.clear();
  inFlight.clear();
}

/**
 * Fetch, decrypt and expose one sealed attachment.
 *
 * `url` must already carry the viewer's `?ft=` token where the file is
 * membership-gated - this is a plain fetch of whatever it is given.
 */
export async function openSealedAttachment(
  url: string,
  keyMaterial: string,
  fetchImpl: typeof fetch = fetch
): Promise<OpenedAttachment> {
  const key = withoutFileToken(url);

  const cached = cache.get(key);
  if (cached) return cached;

  // A screenful of tiles mounts at once; without this, the same file would be
  // downloaded and decrypted once per tile that references it.
  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = (async () => {
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`sealed_attachment_http_${response.status}`);
    }
    const ciphertext = new Uint8Array(await response.arrayBuffer());
    const { meta, bytes } = openSealedFile(ciphertext, keyMaterial);

    // `bytes` is a subarray of the decrypted envelope; slice() so the Blob
    // does not pin the whole plaintext buffer, header included.
    const blob = new Blob([bytes.slice() as BlobPart], { type: meta.mimetype });
    return remember(key, { objectUrl: URL.createObjectURL(blob), meta });
  })();

  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * The attachment as the renderers should see it once opened: a local blob,
 * and the type and name that were sealed inside it rather than the
 * `application/octet-stream` / random string the server holds.
 */
export function applyOpenedAttachment(
  attachment: IAttachment,
  opened: OpenedAttachment
): IAttachment {
  return {
    ...attachment,
    location: opened.objectUrl,
    // A sealed upload never has a server-rendered thumbnail - that is the
    // point - so the tile renders from the file itself.
    locationPreview: '',
    mimetype: opened.meta.mimetype,
    originalName: opened.meta.originalname,
    fileName: opened.meta.originalname,
    size: String(opened.meta.size),
  };
}
