import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import AudioMessage, {
  analyseClipWithin,
  flatPeaks,
  probeClipDuration,
} from './AudioMessage';

// A voice note Safari cannot decode (WebM from Android or Chrome): decodeAudioData rejects, and
// wavesurfer's own decode on load() would fail the same way. The play button used to stay
// disabled for good. These cover the fallback: flat bars, the length from a plain <audio>
// element, and the file itself when the browser cannot play it at all.

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

describe('flatPeaks', () => {
  it('is a quiet, even wave of the asked length', () => {
    expect(flatPeaks(4)).toEqual([0.35, 0.35, 0.35, 0.35]);
    expect(flatPeaks(0)).toHaveLength(1);
  });
});

describe('analyseClipWithin', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('gives up when decoding never settles (Safari without the promise API)', async () => {
    vi.useFakeTimers();
    class HangingContext {
      decodeAudioData() {
        return new Promise(() => {});
      }
      close() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal('AudioContext', HangingContext);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
    const result = analyseClipWithin('https://f/a.webm', 16, 1000);
    await vi.advanceTimersByTimeAsync(1100);
    await expect(result).resolves.toBeNull();
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

  it('is 0 when the browser cannot read the file', async () => {
    const p = probeClipDuration('https://f/a.webm');
    instances[0].onerror();
    await expect(p).resolves.toBe(0);
  });

  it('is 0 when nothing happens in time', async () => {
    vi.useFakeTimers();
    const p = probeClipDuration('https://f/a.webm', 500);
    await vi.advanceTimersByTimeAsync(600);
    await expect(p).resolves.toBe(0);
  });
});

describe('AudioMessage with a clip that cannot be decoded', () => {
  beforeEach(() => {
    wave.instance.load.mockClear();
    wave.instance.playPause.mockClear();
    vi.stubGlobal('AudioContext', undefined);
    (window as any).AudioContext = undefined;
    (window as any).webkitAudioContext = undefined;
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

  const renderIt = () =>
    renderWithProviders(<AudioMessage src="https://f/voice.webm" />, {
      preloadedState: { chatSettingStore: { config: {} } as any },
    });

  it('hands the clip over with flat bars and its real length, and enables Play', async () => {
    renderIt();
    const play = await screen.findByRole('button', { name: 'Play voice message' });
    await waitFor(() => expect(play).not.toBeDisabled());
    const [url, peaks, length] = wave.instance.load.mock.calls[0] as any[];
    expect(url).toBe('https://f/voice.webm');
    expect(peaks[0].every((v: number) => v === 0.35)).toBe(true);
    expect(length).toBe(9);
    fireEvent.click(play);
    expect(wave.instance.playPause).toHaveBeenCalled();
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
    expect(link).toHaveAttribute('href', 'https://f/voice.webm');
  });
});
