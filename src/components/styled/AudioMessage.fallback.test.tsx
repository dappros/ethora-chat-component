import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import AudioMessage, { flatPeaks, probeClipDuration } from './AudioMessage';

// Voice notes on Safari and iOS. The file server answers them as application/octet-stream with no
// Range support and the recordings are WebM, so a plain <audio src> cannot play them there. The
// player fetches the bytes, names the real type, and (where the browser cannot be trusted with
// that type) decodes the clip and plays a WAV. These cover every branch of that path.

const wave = vi.hoisted(() => {
  const handlers: Record<string, (...a: any[]) => void> = {};
  const instance = {
    on: vi.fn((event: string, cb: (...a: any[]) => void) => {
      handlers[event] = cb;
    }),
    load: vi.fn(async () => {
      handlers.ready?.();
    }),
    getDuration: vi.fn(() => 12),
    playPause: vi.fn(async () => undefined),
    play: vi.fn(async () => undefined),
    seekTo: vi.fn(),
    setPlaybackRate: vi.fn(),
    destroy: vi.fn(),
  };
  return { handlers, instance, create: vi.fn(() => instance) };
});
vi.mock('wavesurfer.js', () => ({ default: { create: wave.create } }));

const secure = vi.hoisted(() => ({
  token: 'FRESH',
  recovery: vi.fn(async () => true),
}));
vi.mock('../../helpers/secureFileUrl', () => ({
  isSecureFileUrl: (u?: string) => !!u && u.includes('secure-files.'),
  withFileToken: (u?: string) => {
    if (!u) return '';
    if (!u.includes('secure-files.')) return u;
    const url = new URL(u);
    if (secure.token) url.searchParams.set('ft', secure.token);
    return url.toString();
  },
  requestFileTokenRecovery: secure.recovery,
}));

const voice = vi.hoisted(() => ({
  native: true,
  pcm: null as null | { channels: Float32Array[]; sampleRate: number },
}));
vi.mock('../../helpers/voiceNote', async () => {
  const actual = await vi.importActual<typeof import('../../helpers/voiceNote')>('../../helpers/voiceNote');
  return {
    ...actual,
    canPlayNatively: () => voice.native,
    decodeClipToPcm: vi.fn(async () => voice.pcm),
  };
});

const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0, 0, 0, 0, 0, 0, 0]);
const okResponse = () => ({ ok: true, status: 200, arrayBuffer: async () => WEBM.buffer.slice(0) });

describe('flatPeaks', () => {
  it('is a quiet, even wave of the asked length', () => {
    expect(flatPeaks(4)).toEqual([0.35, 0.35, 0.35, 0.35]);
    expect(flatPeaks(0)).toHaveLength(1);
  });
});

describe('probeClipDuration', () => {
  let instances: any[];
  beforeEach(() => {
    instances = [];
    vi.stubGlobal(
      'Audio',
      class {
        duration = NaN;
        currentTime = 0;
        preload = '';
        onloadedmetadata: any = null;
        ontimeupdate: any = null;
        onerror: any = null;
        removeAttribute = vi.fn();
        set src(_v: string) {
          instances.push(this);
        }
      }
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('reads a normal clip length from its metadata', async () => {
    const p = probeClipDuration('https://f/a.m4a');
    instances[0].duration = 7.5;
    instances[0].onloadedmetadata();
    await expect(p).resolves.toBe(7.5);
  });

  it('works out the length of a WebM clip that reports Infinity', async () => {
    const p = probeClipDuration('https://f/a.webm');
    const audio = instances[0];
    audio.duration = Infinity;
    audio.onloadedmetadata();
    expect(audio.currentTime).toBe(1e7);
    audio.duration = 14.2;
    audio.ontimeupdate();
    await expect(p).resolves.toBe(14.2);
  });

  it('is 0 when the browser cannot read the file, or nothing happens in time', async () => {
    const p = probeClipDuration('https://f/a.webm');
    instances[0].onerror();
    await expect(p).resolves.toBe(0);
    vi.useFakeTimers();
    const q = probeClipDuration('https://f/b.webm', 500);
    await vi.advanceTimersByTimeAsync(600);
    await expect(q).resolves.toBe(0);
  });
});

describe('AudioMessage', () => {
  let blobs: Blob[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    wave.instance.load.mockClear();
    wave.instance.playPause.mockReset();
    wave.instance.playPause.mockResolvedValue(undefined);
    secure.token = 'FRESH';
    secure.recovery.mockClear();
    voice.native = true;
    voice.pcm = null;
    blobs = [];
    (URL as any).createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return `blob:test/${blobs.length}`;
    });
    (URL as any).revokeObjectURL = vi.fn();
    fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'Audio',
      class {
        duration = 9;
        preload = '';
        onloadedmetadata: any = null;
        onerror: any = null;
        removeAttribute() {}
        set src(_v: string) {
          queueMicrotask(() => this.onloadedmetadata?.());
        }
      }
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderIt = (src = 'https://f/voice.blob') =>
    renderWithProviders(<AudioMessage src={src} />, {
      preloadedState: { chatSettingStore: { config: {} } as any },
    });

  const loaded = () => waitFor(() => expect(wave.instance.load).toHaveBeenCalled());

  it('plays the fetched bytes from a blob URL with the real type, not the server URL', async () => {
    voice.pcm = { channels: [new Float32Array(48000).fill(0.2)], sampleRate: 48000 };
    renderIt();
    await loaded();
    const [url, peaks, length] = wave.instance.load.mock.calls[0] as any[];
    expect(url).toBe('blob:test/1');
    expect(blobs[0].type).toBe('audio/webm');
    expect(length).toBeCloseTo(1);
    expect(peaks[0].length).toBeGreaterThan(8);
    const play = await screen.findByRole('button', { name: 'Play voice message' });
    await waitFor(() => expect(play).not.toBeDisabled());
    fireEvent.click(play);
    expect(wave.instance.playPause).toHaveBeenCalled();
  });

  it('plays a WAV made from the samples where the browser cannot be trusted with the format', async () => {
    voice.native = false;
    voice.pcm = { channels: [new Float32Array(4800).fill(0.2)], sampleRate: 48000 };
    renderIt();
    await loaded();
    expect(blobs[0].type).toBe('audio/wav');
    expect(blobs[0].size).toBe(44 + 4800 * 2);
  });

  it('keeps the original bytes when nothing could decode them (flat bars, length from the element)', async () => {
    voice.native = false;
    voice.pcm = null;
    renderIt();
    await loaded();
    const [url, peaks, length] = wave.instance.load.mock.calls[0] as any[];
    expect(url).toBe('blob:test/1');
    expect(blobs[0].type).toBe('audio/webm');
    expect(peaks[0].every((v: number) => v === 0.35)).toBe(true);
    expect(length).toBe(9);
  });

  it('falls back to the server URL when the bytes cannot be fetched at all', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 500 }));
    renderIt();
    await loaded();
    const [url, peaks] = wave.instance.load.mock.calls[0] as any[];
    expect(url).toBe('https://f/voice.blob');
    expect(peaks[0].every((v: number) => v === 0.35)).toBe(true);
  });

  it('puts the current file token on a secure URL whose stored token is old', async () => {
    renderIt('https://secure-files.chat-qa.ethora.com/secure-media/a.blob?ft=OLD');
    await loaded();
    const requested = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requested.searchParams.get('ft')).toBe('FRESH');
  });

  it('asks for one forced token refresh and tries again when the first fetch is refused', async () => {
    secure.token = 'OLD2';
    fetchMock.mockImplementation(async (u: string) =>
      new URL(u).searchParams.get('ft') === 'NEW' ? okResponse() : { ok: false, status: 401 }
    );
    secure.recovery.mockImplementationOnce(async () => {
      secure.token = 'NEW';
      return true;
    });
    renderIt('https://secure-files.chat-qa.ethora.com/secure-media/b.blob?ft=OLD');
    await loaded();
    expect(secure.recovery).toHaveBeenCalledWith({ force: true });
    expect(wave.instance.load.mock.calls[0][0]).toBe('blob:test/1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('offers the file when the browser cannot play it', async () => {
    wave.instance.playPause.mockRejectedValueOnce(new Error('NotSupportedError'));
    renderIt();
    const play = await screen.findByRole('button', { name: 'Play voice message' });
    await waitFor(() => expect(play).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(play);
    });
    const link = await screen.findByRole('link', { name: 'Open file' });
    expect(link).toHaveAttribute('href', 'https://f/voice.blob');
  });

  it('frees the blob URL when the bubble goes away', async () => {
    const { unmount } = renderIt();
    await loaded();
    unmount();
    expect((URL as any).revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
  });
});
