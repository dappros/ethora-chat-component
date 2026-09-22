import { cbc } from '@noble/ciphers/aes.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export { concatBytes, randomBytes };

export interface KeyPair {
  priv: Uint8Array;
  pub: Uint8Array;
}

/** Ed25519 identity key; `seed` is the 32-byte Ed25519 secret key. */
export interface IdentityKey {
  seed: Uint8Array;
  pub: Uint8Array;
}

const ZERO_SALT = new Uint8Array(32);

export function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array | undefined,
  info: string,
  length: number
) {
  return hkdf(sha256, ikm, salt ?? ZERO_SALT, utf8ToBytes(info), length);
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256, key, data);
}

/** AES-256-CBC with PKCS#7 padding. */
export function aesEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array
): Uint8Array {
  return cbc(key, iv).encrypt(data);
}

export function aesDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  data: Uint8Array
): Uint8Array {
  return cbc(key, iv).decrypt(data);
}

export function generateKeyPair(): KeyPair {
  const { secretKey, publicKey } = x25519.keygen();
  return { priv: secretKey, pub: publicKey };
}

export function generateIdentity(): IdentityKey {
  const { secretKey, publicKey } = ed25519.keygen();
  return { seed: secretKey, pub: publicKey };
}

/** X25519; throws on low-order public keys. */
export function dh(priv: Uint8Array, pub: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(priv, pub);
}

/** The X25519 form of an identity key, for X3DH. */
export function identityDhPrivate(identity: IdentityKey): Uint8Array {
  return ed25519.utils.toMontgomerySecret(identity.seed);
}

export function identityDhPublic(identityPub: Uint8Array): Uint8Array {
  return ed25519.utils.toMontgomery(identityPub);
}

export function sign(identity: IdentityKey, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, identity.seed);
}

export function verify(
  signature: Uint8Array,
  message: Uint8Array,
  identityPub: Uint8Array
): boolean {
  try {
    return ed25519.verify(signature, message, identityPub);
  } catch {
    return false;
  }
}

/** Constant-time comparison. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/\s+/g, ''));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Random integer in [min, max]. */
export function randomInt(min: number, max: number): number {
  const [n] = new Uint32Array(randomBytes(4).buffer);
  return min + (n % (max - min + 1));
}
