import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canPlayNatively,
  decodeClipToPcm,
  decodeWebmOpus,
  encodeWav,
  isWebKitEngine,
  parseWebmOpus,
  sniffAudioMime,
} from './voiceNote';

// Real files made with ffmpeg: 0.6 s of a 440 Hz tone in Opus. 'known' has sized elements (mono);
// 'live' has an unknown-size Segment and Clusters like a MediaRecorder recording (stereo).
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const KNOWN = b64('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');
const LIVE = b64('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');

const setUa = (ua: string, touch = 0) => {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touch, configurable: true });
};
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

describe('sniffAudioMime', () => {
  it('names the real type from the first bytes', () => {
    expect(sniffAudioMime(KNOWN)).toBe('audio/webm');
    expect(sniffAudioMime(new TextEncoder().encode('OggS....'))).toBe('audio/ogg');
    expect(sniffAudioMime(new TextEncoder().encode('....ftypM4A '))).toBe('audio/mp4');
    expect(sniffAudioMime(new TextEncoder().encode('RIFF....WAVEfmt '))).toBe('audio/wav');
    expect(sniffAudioMime(new TextEncoder().encode('ID3\u0004....'))).toBe('audio/mpeg');
    expect(sniffAudioMime(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBe('application/octet-stream');
  });
});

describe('parseWebmOpus', () => {
  it('reads a WebM with sized elements', () => {
    const track = parseWebmOpus(KNOWN)!;
    expect(track.channels).toBe(1);
    expect(track.sampleRate).toBe(48000);
    expect(track.packets.length).toBeGreaterThan(20);
    expect(track.codecPrivate?.length).toBeGreaterThan(8);
    const stamps = track.packets.map((p) => p.timestampUs);
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
    expect(stamps[stamps.length - 1]).toBeGreaterThan(400_000);
  });

  it('reads a recorder-style WebM with unknown-size Segment and Clusters', () => {
    const track = parseWebmOpus(LIVE)!;
    expect(track.channels).toBe(2);
    expect(track.packets.length).toBeGreaterThan(20);
  });

  it('is null for something that is not WebM audio', () => {
    expect(parseWebmOpus(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(parseWebmOpus(new Uint8Array(0))).toBeNull();
  });
});

describe('decodeWebmOpus', () => {
  afterEach(() => {
    delete (globalThis as any).AudioDecoder;
    delete (globalThis as any).EncodedAudioChunk;
  });

  it('is null where WebCodecs is missing', async () => {
    expect(await decodeWebmOpus(KNOWN)).toBeNull();
  });

  it('feeds every packet to AudioDecoder and joins the output', async () => {
    const chunks: any[] = [];
    let outputCb: (d: any) => void = () => {};
    (globalThis as any).EncodedAudioChunk = class {
      constructor(public init: any) {}
    };
    (globalThis as any).AudioDecoder = class {
      config: any;
      constructor(init: { output: (d: any) => void }) {
        outputCb = init.output;
      }
      configure(c: any) {
        this.config = c;
      }
      decode(chunk: any) {
        chunks.push(chunk);
        outputCb({
          numberOfChannels: 1,
          numberOfFrames: 960,
          copyTo: (dest: Float32Array) => dest.fill(0.25),
          close: () => undefined,
        });
      }
      async flush() {}
      close() {}
    };
    const pcm = (await decodeWebmOpus(KNOWN))!;
    const track = parseWebmOpus(KNOWN)!;
    expect(chunks).toHaveLength(track.packets.length);
    expect(chunks[0].init.type).toBe('key');
    expect(pcm.sampleRate).toBe(48000);
    expect(pcm.channels).toHaveLength(1);
    expect(pcm.channels[0]).toHaveLength(960 * track.packets.length);
    expect(pcm.channels[0][10]).toBeCloseTo(0.25);
  });

  it('is null when the decoder reports an error', async () => {
    (globalThis as any).EncodedAudioChunk = class {};
    (globalThis as any).AudioDecoder = class {
      constructor(public init: { error: (e: unknown) => void }) {}
      configure() {}
      decode() {
        this.init.error(new Error('bad'));
      }
      async flush() {}
      close() {}
    };
    expect(await decodeWebmOpus(KNOWN)).toBeNull();
  });
});

describe('decodeClipToPcm', () => {
  afterEach(() => {
    delete (window as any).AudioContext;
    delete (globalThis as any).AudioDecoder;
  });

  it('uses the browser decoder when it works', async () => {
    (window as any).AudioContext = class {
      decodeAudioData = async () => ({
        numberOfChannels: 1,
        sampleRate: 44100,
        getChannelData: () => new Float32Array([0.1, 0.2]),
      });
      close = async () => undefined;
    };
    const pcm = await decodeClipToPcm(KNOWN.buffer.slice(0) as ArrayBuffer, 'audio/webm');
    expect(pcm?.sampleRate).toBe(44100);
    expect(Array.from(pcm!.channels[0])).toEqual([expect.closeTo(0.1), expect.closeTo(0.2)]);
  });

  it('falls back to WebCodecs for WebM when the browser decoder refuses', async () => {
    (window as any).AudioContext = class {
      decodeAudioData = async () => {
        throw new DOMException('no', 'EncodingError');
      };
      close = async () => undefined;
    };
    (globalThis as any).EncodedAudioChunk = class {};
    let out: (d: any) => void = () => {};
    (globalThis as any).AudioDecoder = class {
      constructor(init: { output: (d: any) => void }) {
        out = init.output;
      }
      configure() {}
      decode() {
        out({ numberOfChannels: 1, numberOfFrames: 480, copyTo: (d: Float32Array) => d.fill(0.5), close() {} });
      }
      async flush() {}
      close() {}
    };
    const pcm = await decodeClipToPcm(KNOWN.buffer.slice(0) as ArrayBuffer, 'audio/webm');
    expect(pcm?.channels[0].length).toBeGreaterThan(0);
    // A non-WebM file the browser cannot decode has no second chance.
    expect(await decodeClipToPcm(new ArrayBuffer(16), 'audio/ogg')).toBeNull();
  });
});

const readBlob = (blob: Blob): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

describe('encodeWav', () => {
  it('writes a 16-bit PCM file every browser plays', async () => {
    const wav = encodeWav({ channels: [new Float32Array([0, 0.5, -0.5, 1])], sampleRate: 48000 });
    expect(wav.type).toBe('audio/wav');
    const view = new DataView(await readBlob(wav));
    const tag = (at: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(at + i)));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(46, true)).toBe(Math.floor(0.5 * 0x7fff));
    expect(view.getInt16(48, true)).toBe(-0x4000);
    expect(view.getInt16(50, true)).toBe(0x7fff);
  });

  it('interleaves two channels', async () => {
    const wav = encodeWav({ channels: [new Float32Array([1]), new Float32Array([-1])], sampleRate: 8000 });
    const view = new DataView(await readBlob(wav));
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });
});

describe('canPlayNatively', () => {
  afterEach(() => setUa(CHROME));

  it('trusts MP4, MP3 and WAV everywhere', () => {
    setUa(IPHONE);
    expect(canPlayNatively('audio/mp4')).toBe(true);
    expect(canPlayNatively('audio/mpeg')).toBe(true);
    expect(canPlayNatively('audio/wav')).toBe(true);
  });

  it('does not trust WebM on iOS or Safari, whatever canPlayType says', () => {
    setUa(IPHONE, 5);
    expect(isWebKitEngine()).toBe(true);
    expect(canPlayNatively('audio/webm')).toBe(false);
    expect(canPlayNatively('audio/ogg')).toBe(false);
  });

  it('asks the engine outside WebKit', () => {
    setUa(CHROME);
    expect(isWebKitEngine()).toBe(false);
    vi.stubGlobal('Audio', class { canPlayType(t: string) { return t === 'audio/webm' ? 'probably' : ''; } });
    expect(canPlayNatively('audio/webm')).toBe(true);
    expect(canPlayNatively('audio/ogg')).toBe(false);
    vi.unstubAllGlobals();
  });
});
