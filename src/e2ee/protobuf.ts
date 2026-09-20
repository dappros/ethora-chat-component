// Hand-written codec for the three protobuf messages of OMEMO 2 (XEP-0384 §7):
//
// message OMEMOMessage { required uint32 n = 1; required uint32 pn = 2;
//   required bytes dh_pub = 3; optional bytes ciphertext = 4; }
// message OMEMOAuthenticatedMessage { required bytes mac = 1; required bytes message = 2; }
// message OMEMOKeyExchange { required uint32 pk_id = 1; required uint32 spk_id = 2;
//   required bytes ik = 3; required bytes ek = 4;
//   required OMEMOAuthenticatedMessage message = 5; }

import { concatBytes } from './crypto';

const VARINT = 0;
const FIXED64 = 1;
const BYTES = 2;
const FIXED32 = 5;

function varint(value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`Invalid uint32: ${value}`);
  }
  const out: number[] = [];
  while (value > 0x7f) {
    out.push(value % 0x80 | 0x80);
    value = Math.floor(value / 0x80);
  }
  out.push(value);
  return out;
}

class Writer {
  private parts: Uint8Array[] = [];

  uint(field: number, value: number): this {
    this.parts.push(
      Uint8Array.from([...varint((field << 3) | VARINT), ...varint(value)])
    );
    return this;
  }

  bytes(field: number, value: Uint8Array | undefined): this {
    if (value === undefined) return this;
    this.parts.push(
      Uint8Array.from([
        ...varint((field << 3) | BYTES),
        ...varint(value.length),
      ]),
      value
    );
    return this;
  }

  finish(): Uint8Array {
    return concatBytes(...this.parts);
  }
}

/** Last value of each field; unknown fields are skipped. */
function read(buf: Uint8Array): Map<number, number | Uint8Array> {
  const fields = new Map<number, number | Uint8Array>();
  let pos = 0;

  const readVarint = () => {
    let result = 0;
    let scale = 1;
    for (let i = 0; i < 10; i++) {
      if (pos >= buf.length) throw new Error('Truncated varint');
      const b = buf[pos++];
      result += (b & 0x7f) * scale;
      if (!(b & 0x80)) return result;
      scale *= 0x80;
    }
    throw new Error('Varint too long');
  };

  const skip = (length: number) => {
    if (pos + length > buf.length) throw new Error('Truncated field');
    pos += length;
  };

  while (pos < buf.length) {
    const tag = readVarint();
    const field = Math.floor(tag / 8);
    switch (tag % 8) {
      case VARINT:
        fields.set(field, readVarint());
        break;
      case BYTES: {
        const length = readVarint();
        const start = pos;
        skip(length);
        fields.set(field, buf.subarray(start, pos));
        break;
      }
      case FIXED64:
        skip(8);
        break;
      case FIXED32:
        skip(4);
        break;
      default:
        throw new Error('Unsupported wire type');
    }
  }
  return fields;
}

function requireUint(
  fields: Map<number, number | Uint8Array>,
  field: number
): number {
  const value = fields.get(field);
  if (typeof value !== 'number' || value > 0xffffffff)
    throw new Error(`Missing field ${field}`);
  return value;
}

function requireBytes(
  fields: Map<number, number | Uint8Array>,
  field: number
): Uint8Array {
  const value = fields.get(field);
  if (!(value instanceof Uint8Array)) throw new Error(`Missing field ${field}`);
  // Copy, so stored values don't keep the whole input buffer alive
  return value.slice();
}

export interface OmemoMessage {
  n: number;
  pn: number;
  dhPub: Uint8Array;
  ciphertext?: Uint8Array;
}

export function encodeMessage(m: OmemoMessage): Uint8Array {
  return new Writer()
    .uint(1, m.n)
    .uint(2, m.pn)
    .bytes(3, m.dhPub)
    .bytes(4, m.ciphertext)
    .finish();
}

export function decodeMessage(buf: Uint8Array): OmemoMessage {
  const f = read(buf);
  const ciphertext = f.get(4);
  return {
    n: requireUint(f, 1),
    pn: requireUint(f, 2),
    dhPub: requireBytes(f, 3),
    ciphertext:
      ciphertext instanceof Uint8Array ? ciphertext.slice() : undefined,
  };
}

export interface AuthenticatedMessage {
  mac: Uint8Array;
  /** Encoded OMEMOMessage. */
  message: Uint8Array;
}

export function encodeAuthenticated(m: AuthenticatedMessage): Uint8Array {
  return new Writer().bytes(1, m.mac).bytes(2, m.message).finish();
}

export function decodeAuthenticated(buf: Uint8Array): AuthenticatedMessage {
  const f = read(buf);
  return { mac: requireBytes(f, 1), message: requireBytes(f, 2) };
}

export interface KeyExchange {
  pkId: number;
  spkId: number;
  ik: Uint8Array;
  ek: Uint8Array;
  /** Encoded OMEMOAuthenticatedMessage. */
  message: Uint8Array;
}

export function encodeKeyExchange(m: KeyExchange): Uint8Array {
  return new Writer()
    .uint(1, m.pkId)
    .uint(2, m.spkId)
    .bytes(3, m.ik)
    .bytes(4, m.ek)
    .bytes(5, m.message)
    .finish();
}

export function decodeKeyExchange(buf: Uint8Array): KeyExchange {
  const f = read(buf);
  return {
    pkId: requireUint(f, 1),
    spkId: requireUint(f, 2),
    ik: requireBytes(f, 3),
    ek: requireBytes(f, 4),
    message: requireBytes(f, 5),
  };
}
