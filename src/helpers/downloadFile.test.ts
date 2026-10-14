import { describe, it, expect, vi, beforeEach } from 'vitest';

const recover = vi.fn(() => Promise.resolve(true));
vi.mock('./secureFileUrl', () => ({
  isSecureFileUrl: (u: string) => u.includes('secure-files.'),
  requestFileTokenRecovery: () => recover(),
}));

import { downloadFile } from './downloadFile';

const SECURE = 'https://secure-files.chat-qa.ethora.com/secure-media/a.png?ft=t';

describe('downloadFile', () => {
  beforeEach(() => recover.mockClear());

  it('saves the fetched blob under the given name', async () => {
    const saveBlob = vi.fn();
    const saveUrl = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const result = await downloadFile(SECURE, 'a.png', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      saveBlob,
      saveUrl,
    });
    expect(result).toBe('blob');
    expect(saveBlob).toHaveBeenCalledTimes(1);
    expect(saveBlob.mock.calls[0][1]).toBe('a.png');
    expect(saveUrl).not.toHaveBeenCalled();
  });

  it('hands the URL to the browser when fetch rejects (CORS / network)', async () => {
    const saveBlob = vi.fn();
    const saveUrl = vi.fn();
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await downloadFile(SECURE, 'a.png', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      saveBlob,
      saveUrl,
    });
    expect(result).toBe('direct');
    expect(saveUrl).toHaveBeenCalledWith(SECURE, 'a.png');
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it('does not save an error page when the server answers 404', async () => {
    const saveBlob = vi.fn();
    const saveUrl = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(4),
    });
    const result = await downloadFile(SECURE, 'a.png', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      saveBlob,
      saveUrl,
    });
    expect(result).toBe('http-error');
    expect(saveBlob).not.toHaveBeenCalled();
    expect(saveUrl).not.toHaveBeenCalled();
    expect(recover).not.toHaveBeenCalled();
  });

  it('asks for a fresh file token on 401/403 from a secure host', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await downloadFile(SECURE, 'a.png', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      saveBlob: vi.fn(),
      saveUrl: vi.fn(),
    });
    expect(recover).toHaveBeenCalledTimes(1);
  });
});
