import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sealFileForUpload } from '../e2ee/fileEnvelope';
import {
  applyOpenedAttachment,
  clearSealedAttachmentCache,
  openSealedAttachment,
} from './sealedAttachments';

const URL_BASE = 'https://secure-files.example/bucket/';

const sealed = async (content: string, name: string, type: string) =>
  sealFileForUpload(new File([content], name, { type }));

/** A fetch that serves the given ciphertext and counts calls. */
const serving = (ciphertext: Uint8Array) =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => ciphertext.slice().buffer,
  })) as unknown as typeof fetch;

beforeEach(() => {
  clearSealedAttachmentCache();
  vi.restoreAllMocks();
});

describe('openSealedAttachment', () => {
  it('recovers the file, its type and its real name', async () => {
    const seal = await sealed('the actual contents', 'contract-final.pdf', 'application/pdf');
    const fetchImpl = serving(seal.ciphertext);

    const opened = await openSealedAttachment(
      `${URL_BASE}1`,
      seal.keyMaterial,
      fetchImpl
    );

    expect(opened.meta.mimetype).toBe('application/pdf');
    expect(opened.meta.originalname).toBe('contract-final.pdf');
    expect(opened.objectUrl).toMatch(/^blob:/);
  });

  it('downloads a given file once however many tiles ask for it', async () => {
    const seal = await sealed('x', 'a.txt', 'text/plain');
    const fetchImpl = serving(seal.ciphertext);

    await Promise.all([
      openSealedAttachment(`${URL_BASE}1`, seal.keyMaterial, fetchImpl),
      openSealedAttachment(`${URL_BASE}1`, seal.keyMaterial, fetchImpl),
    ]);
    await openSealedAttachment(`${URL_BASE}1`, seal.keyMaterial, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('treats a rotated fileToken as the same file, not a second copy', async () => {
    // fileTokens rotate roughly hourly; caching on the full URL would
    // re-download and re-decrypt every attachment on every rotation.
    const seal = await sealed('x', 'a.txt', 'text/plain');
    const fetchImpl = serving(seal.ciphertext);

    const first = await openSealedAttachment(`${URL_BASE}1?ft=old`, seal.keyMaterial, fetchImpl);
    const second = await openSealedAttachment(`${URL_BASE}1?ft=new`, seal.keyMaterial, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(second.objectUrl).toBe(first.objectUrl);
  });

  it('surfaces a failed download rather than caching the failure', async () => {
    const seal = await sealed('x', 'a.txt', 'text/plain');
    const failing = vi.fn(async () => ({ ok: false, status: 403 })) as unknown as typeof fetch;

    await expect(
      openSealedAttachment(`${URL_BASE}1`, seal.keyMaterial, failing)
    ).rejects.toThrow(/sealed_attachment_http_403/);

    // A second attempt must be allowed to try again.
    const fetchImpl = serving(seal.ciphertext);
    const opened = await openSealedAttachment(`${URL_BASE}1`, seal.keyMaterial, fetchImpl);
    expect(opened.meta.originalname).toBe('a.txt');
  });

  it('rejects ciphertext that does not match the key', async () => {
    const a = await sealed('aaa', 'a.txt', 'text/plain');
    const b = await sealed('bbb', 'b.txt', 'text/plain');

    await expect(
      openSealedAttachment(`${URL_BASE}1`, b.keyMaterial, serving(a.ciphertext))
    ).rejects.toThrow();
  });

  it('revokes blobs on logout so plaintext does not outlive the session', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const seal = await sealed('x', 'a.txt', 'text/plain');

    const opened = await openSealedAttachment(
      `${URL_BASE}1`,
      seal.keyMaterial,
      serving(seal.ciphertext)
    );
    clearSealedAttachmentCache();

    expect(revoke).toHaveBeenCalledWith(opened.objectUrl);
  });
});

describe('applyOpenedAttachment', () => {
  it('replaces the placeholders the server holds with the sealed truth', () => {
    const attachment = {
      location: `${URL_BASE}1?ft=tok`,
      locationPreview: '',
      mimetype: 'application/octet-stream',
      originalName: '4a7d1ed414474e4033ac29ccb8653d9b',
      fileName: 'stored-1',
      size: '2048',
    };

    const result = applyOpenedAttachment(attachment, {
      objectUrl: 'blob:local/1',
      meta: { mimetype: 'image/png', originalname: 'photo.png', size: 1024 },
    });

    expect(result.location).toBe('blob:local/1');
    expect(result.mimetype).toBe('image/png');
    expect(result.originalName).toBe('photo.png');
    expect(result.fileName).toBe('photo.png');
    expect(result.size).toBe('1024');
    // A sealed upload has no server-rendered thumbnail by design.
    expect(result.locationPreview).toBe('');
  });
});
