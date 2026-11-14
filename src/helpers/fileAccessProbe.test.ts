import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyResponse,
  probeFileAccess,
  readBlockReason,
  resetFileAccessProbeCache,
} from './fileAccessProbe';
import {
  isSensitiveMessage,
  pickCoverPreview,
  pickProbeAttachment,
  sensitiveFlagsFromUploads,
} from './sensitiveMedia';
import { isUploadBlockedSensitive } from './uploadBlocked';

const SECURE = 'https://secure-files.example.com/bucket/a.png';

const response = (status: number, block?: string) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'x-ethora-block' ? block ?? null : null) },
  }) as unknown as Response;

describe('classifyResponse', () => {
  it.each([
    [response(200), 'ok'],
    [response(403, 'age-required'), 'age-required'],
    [response(403, 'moderation'), 'moderation'],
    [response(403), 'forbidden'],
    [response(404), 'unknown'],
    [response(401), 'unknown'],
  ])('%#', (res, expected) => {
    expect(classifyResponse(res)).toBe(expected);
  });

  it('reads the header case-insensitively', () => {
    expect(readBlockReason(' Age-Required ')).toBe('age-required');
    expect(readBlockReason('other')).toBeNull();
  });
});

describe('probeFileAccess', () => {
  beforeEach(() => resetFileAccessProbeCache());

  it('sends one HEAD with the viewer token and caches the answer per file', async () => {
    const fetchImpl = vi.fn(async () => response(403, 'moderation'));
    const first = await probeFileAccess(`${SECURE}?ft=old`, { fetchImpl, fileToken: 'tok' });
    const second = await probeFileAccess(SECURE, { fetchImpl, fileToken: 'tok2' });
    expect(first).toBe('moderation');
    expect(second).toBe('moderation');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${SECURE}?ft=tok`);
    expect(init.method).toBe('HEAD');
    expect(init.credentials).toBe('omit');
  });

  it('asks again only when forced', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(403, 'age-required'))
      .mockResolvedValueOnce(response(200));
    expect(await probeFileAccess(SECURE, { fetchImpl, fileToken: 't' })).toBe('age-required');
    expect(await probeFileAccess(SECURE, { fetchImpl, fileToken: 't', force: true })).toBe('ok');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('a network or CORS failure is unknown, never a block', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await probeFileAccess(SECURE, { fetchImpl })).toBe('unknown');
  });
});

describe('sensitive media helpers', () => {
  it('flags a message when any upload is sensitive', () => {
    expect(sensitiveFlagsFromUploads([{ sensitive: false }, undefined])).toBeUndefined();
    expect(
      sensitiveFlagsFromUploads([{}, { sensitive: true, sensitiveCategory: 'nudity' }])
    ).toEqual({ isSensitive: 'true', sensitiveCategory: 'nudity' });
    expect(sensitiveFlagsFromUploads([{ sensitive: 'true' }])).toEqual({ isSensitive: 'true' });
  });

  it('reads the flag off a message', () => {
    expect(isSensitiveMessage({ isSensitive: 'true' })).toBe(true);
    expect(isSensitiveMessage({ isSensitive: true })).toBe(true);
    expect(isSensitiveMessage({ isSensitive: 'false' })).toBe(false);
    expect(isSensitiveMessage({})).toBe(false);
  });

  it('probes the first picture or video, and covers with the first preview', () => {
    const attachments = [
      { location: 'https://x/doc.pdf', mimetype: 'application/pdf', originalName: 'doc.pdf' },
      {
        location: 'https://x/a.png',
        locationPreview: 'https://x/a-thumb.png',
        mimetype: 'image/png',
        originalName: 'a.png',
      },
    ];
    expect(pickProbeAttachment(attachments)?.location).toBe('https://x/a.png');
    expect(pickCoverPreview(attachments)).toBe('https://x/a-thumb.png');
  });

  it('recognises a blocked upload', () => {
    expect(
      isUploadBlockedSensitive({
        response: { status: 422, data: { code: 'UPLOAD_BLOCKED_SENSITIVE' } },
      })
    ).toBe(true);
    expect(
      isUploadBlockedSensitive({ response: { status: 422, data: { code: 'OTHER' } } })
    ).toBe(false);
    expect(isUploadBlockedSensitive(new Error('x'))).toBe(false);
  });
});
