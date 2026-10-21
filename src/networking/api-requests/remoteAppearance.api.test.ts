import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchRemoteAppearance,
  isValidRemoteAppId,
  remoteAppearanceUrl,
} from './remoteAppearance.api';

const APP = '646cc8dc96d4a4dc8f7b2f2d';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remoteAppearanceUrl', () => {
  it('uses the v2 route on the API origin, whatever version suffix the base carries', () => {
    for (const base of [
      'https://api.example.com',
      'https://api.example.com/',
      'https://api.example.com/v1',
      'https://api.example.com/v1/',
      'https://api.example.com/v2',
    ]) {
      expect(remoteAppearanceUrl(base, APP)).toBe(
        `https://api.example.com/v2/chat-component/config?appId=${APP}`
      );
    }
  });

  it('adds the announced version as v, and only a sane one', () => {
    expect(remoteAppearanceUrl('https://a.test', APP, '1790000000001')).toBe(
      `https://a.test/v2/chat-component/config?appId=${APP}&v=1790000000001`
    );
    expect(remoteAppearanceUrl('https://a.test', APP, 'x y&z=1')).toBe(
      `https://a.test/v2/chat-component/config?appId=${APP}`
    );
  });
});

describe('isValidRemoteAppId', () => {
  it('takes id-shaped strings only', () => {
    expect(isValidRemoteAppId(APP)).toBe(true);
    expect(isValidRemoteAppId('a/b')).toBe(false);
    expect(isValidRemoteAppId('')).toBe(false);
    expect(isValidRemoteAppId(undefined)).toBe(false);
    expect(isValidRemoteAppId('x'.repeat(65))).toBe(false);
  });
});

describe('fetchRemoteAppearance', () => {
  const answer = (body: unknown, ok = true, status = 200) =>
    vi.fn().mockResolvedValue({ ok, status, json: async () => body });

  it('reads with no credentials and validates the record', async () => {
    const fetchMock = answer({
      ok: true,
      config: { 'colors.primary': '#0052cd', baseUrl: 'https://evil.example', disableMedia: true },
      version: '1790000000001',
    });
    vi.stubGlobal('fetch', fetchMock);
    const snap = await fetchRemoteAppearance({ baseUrl: 'https://api.test/v1', appId: APP, version: '5' });
    expect(snap).toEqual({
      record: { 'colors.primary': '#0052cd', disableMedia: true },
      version: '1790000000001',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.test/v2/chat-component/config?appId=${APP}&v=5`);
    expect(init.credentials).toBe('omit');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('an App with nothing saved reads as an empty record at version 0', async () => {
    vi.stubGlobal('fetch', answer({ ok: true, config: {} }));
    expect(await fetchRemoteAppearance({ baseUrl: 'https://api.test', appId: APP })).toEqual({
      record: {},
      version: '0',
    });
  });

  it('throws on an HTTP error and on a bad app id', async () => {
    vi.stubGlobal('fetch', answer({}, false, 502));
    await expect(fetchRemoteAppearance({ baseUrl: 'https://api.test', appId: APP })).rejects.toThrow(/502/);
    await expect(fetchRemoteAppearance({ baseUrl: 'https://api.test', appId: '../x' })).rejects.toThrow(/appId/);
  });
});
