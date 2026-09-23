import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sealFileForUpload } from '../e2ee/fileEnvelope';
import { openSealedAttachment, saveSealedAttachment } from './sealedAttachments';

// Real call sites append the viewer's `?ft=` token before calling in.
const URL_BASE = 'https://secure-files.example/bucket/';
const secure = (n: number) => `${URL_BASE}${n}?ft=tok`;

const sealed = (content: string, name: string, type: string) =>
  sealFileForUpload(new File([content], name, { type }));

/** A fetch that serves the given ciphertext and counts calls. */
const serving = (ciphertext: Uint8Array) =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => ciphertext.slice().buffer,
  })) as unknown as typeof fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('openSealedAttachment', () => {
  it('recovers the bytes, the type and the real name', async () => {
    const seal = await sealed('the actual contents', 'contract-final.pdf', 'application/pdf');

    const opened = await openSealedAttachment(
      secure(1),
      seal.keyMaterial,
      serving(seal.ciphertext)
    );

    expect(opened.meta.mimetype).toBe('application/pdf');
    expect(opened.meta.originalname).toBe('contract-final.pdf');
    expect(new TextDecoder().decode(opened.bytes)).toBe('the actual contents');
  });

  it('reports a refused download rather than returning junk', async () => {
    const seal = await sealed('x', 'a.txt', 'text/plain');
    const failing = vi.fn(async () => ({ ok: false, status: 403 })) as unknown as typeof fetch;

    await expect(
      openSealedAttachment(secure(1), seal.keyMaterial, failing)
    ).rejects.toThrow(/sealed_attachment_http_403/);
  });

  it('rejects ciphertext that does not match the key', async () => {
    const a = await sealed('aaa', 'a.txt', 'text/plain');
    const b = await sealed('bbb', 'b.txt', 'text/plain');

    await expect(
      openSealedAttachment(secure(1), b.keyMaterial, serving(a.ciphertext))
    ).rejects.toThrow();
  });

  it('fetches exactly the URL it is given, token and all', async () => {
    // The `?ft=` token is per-viewer and appended by the caller; this layer
    // must not rewrite the URL or the secure vhost refuses the request.
    const seal = await sealed('x', 'a.txt', 'text/plain');
    const fetchImpl = serving(seal.ciphertext);

    await openSealedAttachment(secure(1), seal.keyMaterial, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(secure(1));
  });
});

describe('saveSealedAttachment', () => {
  it('saves under the sealed filename with the sealed type', async () => {
    const seal = await sealed('the actual contents', 'contract-final.pdf', 'application/pdf');
    const save = vi.fn();

    const meta = await saveSealedAttachment(secure(1), seal.keyMaterial, {
      fetchImpl: serving(seal.ciphertext),
      save,
    });

    expect(save).toHaveBeenCalledTimes(1);
    const [blob, fileName] = save.mock.calls[0];
    expect(fileName).toBe('contract-final.pdf');
    expect(blob.type).toBe('application/pdf');
    expect(new TextDecoder().decode(await blob.arrayBuffer())).toBe(
      'the actual contents'
    );
    // Returned so the card can relabel itself once the name is known.
    expect(meta.originalname).toBe('contract-final.pdf');
  });

  it('saves nothing when the file cannot be opened', async () => {
    const a = await sealed('aaa', 'a.txt', 'text/plain');
    const b = await sealed('bbb', 'b.txt', 'text/plain');
    const save = vi.fn();

    await expect(
      saveSealedAttachment(secure(1), b.keyMaterial, {
        fetchImpl: serving(a.ciphertext),
        save,
      })
    ).rejects.toThrow();

    expect(save).not.toHaveBeenCalled();
  });

  it('does not leave the decrypted file behind as an object URL', async () => {
    // The plaintext must not sit in the tab after the download: the anchor
    // path creates one URL and revokes it in the same turn.
    const seal = await sealed('x', 'a.txt', 'text/plain');
    const created: string[] = [];
    const revoked: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:test/${created.length}`;
      created.push(url);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u) => {
      revoked.push(u);
    });

    await saveSealedAttachment(secure(1), seal.keyMaterial, {
      fetchImpl: serving(seal.ciphertext),
    });

    expect(created).toHaveLength(1);
    expect(revoked).toEqual(created);
  });
});

describe('openSealedAttachment failure modes', () => {
  it('names a missing fileToken rather than letting it 403', async () => {
    const seal = await sealed('x', 'a.txt', 'text/plain');
    const fetchImpl = vi.fn();

    await expect(
      openSealedAttachment(
        'https://secure-files.example/bucket/1',
        seal.keyMaterial,
        fetchImpl as unknown as typeof fetch
      )
    ).rejects.toThrow(/no_file_token/);

    // Nothing is even attempted: the request cannot succeed.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('names an unreachable host, which is what a CORS rejection looks like', async () => {
    // fetch() rejects with a bare TypeError for CORS, DNS and offline alike.
    const seal = await sealed('x', 'a.txt', 'text/plain');
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    await expect(
      openSealedAttachment(secure(1), seal.keyMaterial, failing)
    ).rejects.toThrow(/unreachable.*Failed to fetch/);
  });

  it('leaves a non-secure URL alone, token or not', async () => {
    // A v1 (public) attachment is not token-gated; requiring ?ft= there would
    // break every legacy upload.
    const seal = await sealed('x', 'a.txt', 'text/plain');
    const fetchImpl = serving(seal.ciphertext);

    const opened = await openSealedAttachment(
      'https://files.example/bucket/1',
      seal.keyMaterial,
      fetchImpl
    );
    expect(opened.meta.originalname).toBe('a.txt');
  });
});
