// Getting a sealed attachment onto the viewer's disk.
//
// What arrives over XMPP for an e2ee attachment is a URL to opaque bytes plus
// a key that came in the encrypted <body> (see e2ee/fileEnvelope.ts and
// sendMediaMessage.xmpp.ts). There is deliberately no preview: the server
// never rendered one - that is the point of sealing - and building one here
// would mean downloading and decrypting every attachment in the transcript
// just to scroll past it. So a sealed attachment is offered as a download,
// and nothing leaves the server until the viewer asks for it.
//
// The plaintext is not retained. The object URL exists for the length of one
// click and is revoked immediately, so a decrypted file is never sitting in
// the tab waiting to be found.

import { openSealedFile, type FileEnvelopeMeta } from '../e2ee/fileEnvelope';

export interface OpenedAttachment {
  bytes: Uint8Array;
  meta: FileEnvelopeMeta;
}

/**
 * Fetch and decrypt one sealed attachment.
 *
 * `url` must already carry the viewer's `?ft=` token where the file is
 * membership-gated - this is a plain fetch of whatever it is given.
 */
export async function openSealedAttachment(
  url: string,
  keyMaterial: string,
  fetchImpl: typeof fetch = fetch
): Promise<OpenedAttachment> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`sealed_attachment_http_${response.status}`);
  }
  const ciphertext = new Uint8Array(await response.arrayBuffer());
  return openSealedFile(ciphertext, keyMaterial);
}

/** Hands a blob to the browser as a download. Injectable for tests. */
export type SaveBlob = (blob: Blob, fileName: string) => void;

const saveViaAnchor: SaveBlob = (blob, fileName) => {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // The browser has already taken the blob by the time click() returns, so
    // revoking now frees the plaintext without cancelling the download.
    URL.revokeObjectURL(objectUrl);
  }
};

/**
 * Fetch, decrypt and save one sealed attachment under its real filename.
 *
 * Returns the recovered metadata so the caller can label the card with the
 * real name once it is known - before the first download there is no way to
 * know it, because it lives inside the seal.
 */
export async function saveSealedAttachment(
  url: string,
  keyMaterial: string,
  deps: { fetchImpl?: typeof fetch; save?: SaveBlob } = {}
): Promise<FileEnvelopeMeta> {
  const { meta, bytes } = await openSealedAttachment(
    url,
    keyMaterial,
    deps.fetchImpl ?? fetch
  );

  // `bytes` is a subarray of the decrypted envelope; slice() so the Blob does
  // not pin the whole plaintext buffer, header included.
  const blob = new Blob([bytes.slice() as BlobPart], { type: meta.mimetype });
  (deps.save ?? saveViaAnchor)(blob, meta.originalname);

  return meta;
}
