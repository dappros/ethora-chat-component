import { describe, expect, it } from 'vitest';

import {
  decodeFileEnvelope,
  encodeFileEnvelope,
  openSealedFile,
  sealFileForUpload,
} from './fileEnvelope';

const bytes = (...n: number[]) => Uint8Array.from(n);

describe('file envelope encoding', () => {
  it('round-trips metadata and body', () => {
    const body = bytes(1, 2, 3, 250, 0, 255);
    const meta = {
      mimetype: 'image/png',
      originalname: 'holiday photo.png',
      size: body.length,
    };

    const decoded = decodeFileEnvelope(encodeFileEnvelope(meta, body));

    expect(decoded.meta).toEqual(meta);
    expect(Array.from(decoded.bytes)).toEqual(Array.from(body));
  });

  it('survives a body that contains the header delimiter bytes', () => {
    // The header is length-prefixed precisely so arbitrary file bytes - here
    // a `}` and a NUL - cannot be mistaken for the end of the JSON.
    const body = bytes(0x7d, 0x00, 0x7b, 0x22);
    const meta = { mimetype: 'application/zip', originalname: 'a.zip', size: 4 };

    const decoded = decodeFileEnvelope(encodeFileEnvelope(meta, body));
    expect(Array.from(decoded.bytes)).toEqual(Array.from(body));
  });

  it('round-trips a non-ASCII filename', () => {
    const meta = { mimetype: 'text/plain', originalname: 'звіт-2026.txt', size: 1 };
    const decoded = decodeFileEnvelope(encodeFileEnvelope(meta, bytes(7)));
    expect(decoded.meta.originalname).toBe('звіт-2026.txt');
  });

  it('handles an empty file', () => {
    const meta = { mimetype: 'text/plain', originalname: 'empty.txt', size: 0 };
    const decoded = decodeFileEnvelope(encodeFileEnvelope(meta, new Uint8Array(0)));
    expect(decoded.bytes.length).toBe(0);
    expect(decoded.meta.originalname).toBe('empty.txt');
  });

  it('rejects bytes that are not an envelope', () => {
    expect(() => decodeFileEnvelope(bytes(1, 2, 3))).toThrow(/truncated/);
    expect(() => decodeFileEnvelope(new Uint8Array(32))).toThrow(/bad_magic/);
  });

  it('rejects a header length that runs past the buffer', () => {
    // Guards against a forged length reading into unrelated heap memory.
    const good = encodeFileEnvelope(
      { mimetype: 'text/plain', originalname: 'a.txt', size: 1 },
      bytes(9)
    );
    new DataView(good.buffer, good.byteOffset, good.byteLength).setUint32(9, 0xffff, false);
    expect(() => decodeFileEnvelope(good)).toThrow(/truncated/);
  });

  it('rejects a future envelope version instead of misreading it', () => {
    const good = encodeFileEnvelope(
      { mimetype: 'text/plain', originalname: 'a.txt', size: 1 },
      bytes(9)
    );
    good[8] = 2;
    expect(() => decodeFileEnvelope(good)).toThrow(/unsupported_version_2/);
  });
});

describe('sealFileForUpload', () => {
  const makeFile = (content: string, name: string, type: string) =>
    new File([content], name, { type });

  it('produces ciphertext that opens back to the original file and metadata', async () => {
    const file = makeFile('top secret contents', 'contract-final.pdf', 'application/pdf');

    const sealed = await sealFileForUpload(file);
    const opened = openSealedFile(sealed.ciphertext, sealed.keyMaterial);

    expect(opened.meta.mimetype).toBe('application/pdf');
    expect(opened.meta.originalname).toBe('contract-final.pdf');
    expect(new TextDecoder().decode(opened.bytes)).toBe('top secret contents');
  });

  it('leaks neither the filename, the extension nor the plaintext', async () => {
    const file = makeFile('top secret contents', 'contract-final.pdf', 'application/pdf');

    const sealed = await sealFileForUpload(file);
    const onTheWire = new TextDecoder().decode(sealed.ciphertext);

    expect(sealed.filename).not.toContain('contract');
    expect(sealed.filename).not.toContain('.pdf');
    expect(sealed.filename).toMatch(/^[0-9a-f]{32}$/);
    expect(onTheWire).not.toContain('contract-final');
    expect(onTheWire).not.toContain('top secret');
    expect(onTheWire).not.toContain('application/pdf');
  });

  it('uses a fresh key per file, so one key cannot open another', async () => {
    const a = await sealFileForUpload(makeFile('aaa', 'a.txt', 'text/plain'));
    const b = await sealFileForUpload(makeFile('bbb', 'b.txt', 'text/plain'));

    expect(a.keyMaterial).not.toBe(b.keyMaterial);
    expect(a.filename).not.toBe(b.filename);
    expect(() => openSealedFile(b.ciphertext, a.keyMaterial)).toThrow();
  });

  it('refuses ciphertext that was tampered with in transit', async () => {
    const sealed = await sealFileForUpload(makeFile('hello', 'a.txt', 'text/plain'));
    sealed.ciphertext[0] ^= 0xff;

    expect(() => openSealedFile(sealed.ciphertext, sealed.keyMaterial)).toThrow(
      /authentication failed/i
    );
  });

  it('records octet-stream when the browser could not type the file', async () => {
    const sealed = await sealFileForUpload(makeFile('x', 'mystery', ''));
    const opened = openSealedFile(sealed.ciphertext, sealed.keyMaterial);
    expect(opened.meta.mimetype).toBe('application/octet-stream');
  });
});
