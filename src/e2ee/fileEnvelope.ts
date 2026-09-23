// Attachment encryption for e2ee rooms.
//
// Text messages encrypt only <body>; <data> rides in the clear so the push
// module can still build a notification (see sendTextMessage). For media that
// trade does not work: <data> is where `mimetype`, `originalName` and the
// preview URL live, so an attachment sent the ordinary way tells the server
// (and MAM, forever) that this conversation just exchanged `contract-final.pdf`
// - and the upload pipeline would render a thumbnail of it into a public
// bucket on the way past.
//
// So the file is sealed here before it ever reaches the network. What goes up
// is opaque bytes under `application/octet-stream` with a random name and the
// `clientEncrypted` flag, which tells the backend to store it verbatim - no
// preview, no probe, no mimetype branch (POST /v2/files/secure, POST /v1/files).
// The real mimetype and filename travel INSIDE the sealed payload, so the
// server never holds them in any form.
//
// The 48-byte key material is not in here: it belongs to the message, and
// rides in the OMEMO-encrypted <body> alongside it.

import { randomBytes, toBase64, fromBase64, toHex } from './crypto';
import { decryptPayload, encryptPayload } from './ratchet';

/** `ETHOFILE` — lets a decoder reject anything that is not one of ours. */
const MAGIC = Uint8Array.from([0x45, 0x54, 0x48, 0x4f, 0x46, 0x49, 0x4c, 0x45]);
const VERSION = 1;
const HEADER_OFFSET = MAGIC.length + 1 + 4;

/** What the server must not learn, and the receiver needs to render. */
export interface FileEnvelopeMeta {
  mimetype: string;
  originalname: string;
  size: number;
}

export interface SealedFile {
  /** Ciphertext, ready to upload. */
  ciphertext: Uint8Array;
  /** Base64 of the 48-byte key material. Belongs in the encrypted <body>. */
  keyMaterial: string;
  /** Random, extension-free name to upload under. */
  filename: string;
}

/**
 * MAGIC(8) | version(1) | headerLen(4, big-endian) | headerJSON | fileBytes
 *
 * Length-prefixed rather than delimited: a JSON header is arbitrary text and
 * the body is arbitrary bytes, so there is no separator that cannot occur in
 * either.
 */
export function encodeFileEnvelope(
  meta: FileEnvelopeMeta,
  bytes: Uint8Array
): Uint8Array {
  const header = new TextEncoder().encode(
    JSON.stringify({
      mimetype: meta.mimetype,
      originalname: meta.originalname,
      size: meta.size,
    })
  );

  const out = new Uint8Array(HEADER_OFFSET + header.length + bytes.length);
  out.set(MAGIC, 0);
  out[MAGIC.length] = VERSION;
  new DataView(out.buffer).setUint32(MAGIC.length + 1, header.length, false);
  out.set(header, HEADER_OFFSET);
  out.set(bytes, HEADER_OFFSET + header.length);
  return out;
}

export function decodeFileEnvelope(envelope: Uint8Array): {
  meta: FileEnvelopeMeta;
  bytes: Uint8Array;
} {
  if (envelope.length < HEADER_OFFSET) {
    throw new Error('file_envelope_truncated');
  }
  for (let i = 0; i < MAGIC.length; i++) {
    if (envelope[i] !== MAGIC[i]) throw new Error('file_envelope_bad_magic');
  }
  const version = envelope[MAGIC.length];
  if (version !== VERSION) {
    throw new Error(`file_envelope_unsupported_version_${version}`);
  }

  const headerLen = new DataView(
    envelope.buffer,
    envelope.byteOffset,
    envelope.byteLength
  ).getUint32(MAGIC.length + 1, false);

  const bodyStart = HEADER_OFFSET + headerLen;
  // A forged length must not read past the buffer into whatever follows it.
  if (bodyStart > envelope.length) throw new Error('file_envelope_truncated');

  const meta = JSON.parse(
    new TextDecoder().decode(envelope.subarray(HEADER_OFFSET, bodyStart))
  ) as FileEnvelopeMeta;

  return { meta, bytes: envelope.subarray(bodyStart) };
}

/**
 * Seal a file for upload.
 *
 * Reuses the OMEMO payload primitives (AES-256-CBC + truncated HMAC, fresh
 * random key per call) so attachments and message bodies are protected by the
 * same construction rather than a second, separately-reviewed one.
 */
export async function sealFileForUpload(file: File): Promise<SealedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const envelope = encodeFileEnvelope(
    {
      // A browser that cannot guess the type leaves `type` empty; record that
      // as octet-stream rather than writing '' into the envelope.
      mimetype: file.type || 'application/octet-stream',
      originalname: file.name,
      size: file.size,
    },
    bytes
  );

  const { keyMaterial, payload } = encryptPayload(envelope);

  return {
    ciphertext: payload,
    keyMaterial: toBase64(keyMaterial),
    // No extension: `.pdf` on an opaque blob would give back the one thing
    // sealing it was meant to hide.
    filename: toHex(randomBytes(16)),
  };
}

/** Inverse of sealFileForUpload, for the receiving side. */
export function openSealedFile(
  ciphertext: Uint8Array,
  keyMaterial: string
): { meta: FileEnvelopeMeta; bytes: Uint8Array } {
  return decodeFileEnvelope(decryptPayload(fromBase64(keyMaterial), ciphertext));
}
