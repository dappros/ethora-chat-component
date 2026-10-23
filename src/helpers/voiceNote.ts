// Voice notes the browser may not be able to play or decode by itself.
//
// This chat records WebM/Opus in Chrome and Android, and the file server sends every voice note
// as application/octet-stream without Range support. Safari and every iOS browser either refuse
// such a URL in an <audio> element (no 206 answers, unknown type) or cannot read WebM at all.
// So the player fetches the bytes itself, names the real type, and when the engine is WebKit
// decodes the clip to samples (AudioContext first, WebCodecs for WebM/Opus when that fails) and
// plays a WAV made from them, which every browser can play.

export type Pcm = { channels: Float32Array[]; sampleRate: number };

/** MIME type from the first bytes of the file; the server's own Content-Type is useless here. */
export const sniffAudioMime = (bytes: Uint8Array): string => {
  const at = (i: number) => bytes[i];
  const ascii = (from: number, len: number) =>
    String.fromCharCode(...Array.from(bytes.slice(from, from + len)));
  if (at(0) === 0x1a && at(1) === 0x45 && at(2) === 0xdf && at(3) === 0xa3) return 'audio/webm';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(4, 4) === 'ftyp') return 'audio/mp4';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'audio/wav';
  if (ascii(0, 3) === 'ID3' || (at(0) === 0xff && (at(1) & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (ascii(0, 4) === 'fLaC') return 'audio/flac';
  return 'application/octet-stream';
};

/** WebKit engine: Safari, and every browser on iOS. */
export const isWebKitEngine = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  const safari = /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(ua);
  return ios || safari;
};

/**
 * Can this browser be trusted to play this file from a blob URL? MP4/AAC, MP3 and WAV play
 * everywhere; WebM, Ogg and the rest only outside WebKit (where support depends on the OS
 * version and canPlayType is not reliable).
 */
export const canPlayNatively = (mime: string): boolean => {
  if (mime === 'audio/mp4' || mime === 'audio/mpeg' || mime === 'audio/wav') return true;
  if (isWebKitEngine()) return false;
  try {
    return typeof Audio !== 'undefined' && new Audio().canPlayType(mime) !== '';
  } catch {
    return false;
  }
};

// ── WebM / Opus demux (just what a MediaRecorder voice note needs) ─────────────

type OpusPacket = { data: Uint8Array; timestampUs: number };
type OpusTrack = {
  packets: OpusPacket[];
  channels: number;
  sampleRate: number;
  codecPrivate?: Uint8Array;
};

const ID = {
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  Audio: 0xe1,
  Channels: 0x9f,
  SamplingFrequency: 0xb5,
  CodecPrivate: 0x63a2,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  BlockGroup: 0xa0,
  Block: 0xa1,
  SimpleBlock: 0xa3,
};
const MASTERS = new Set([
  ID.Segment,
  ID.Info,
  ID.Tracks,
  ID.TrackEntry,
  ID.Audio,
  ID.Cluster,
  ID.BlockGroup,
]);

const readVint = (
  b: Uint8Array,
  pos: number,
  keepMarker: boolean
): { value: number; len: number; unknown: boolean } | null => {
  const first = b[pos];
  if (first === undefined) return null;
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && !(first & mask)) {
    len += 1;
    mask >>= 1;
  }
  if (len > 8 || pos + len > b.length) return null;
  let value = keepMarker ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < len; i += 1) {
    value = value * 256 + b[pos + i];
    if (b[pos + i] !== 0xff) allOnes = false;
  }
  return { value, len, unknown: !keepMarker && allOnes };
};

const readUint = (b: Uint8Array, from: number, to: number): number => {
  let v = 0;
  for (let i = from; i < to; i += 1) v = v * 256 + b[i];
  return v;
};

const readFloat = (b: Uint8Array, from: number, to: number): number => {
  const view = new DataView(b.buffer, b.byteOffset + from, to - from);
  return to - from === 4 ? view.getFloat32(0) : to - from === 8 ? view.getFloat64(0) : 0;
};

export const parseWebmOpus = (bytes: Uint8Array): OpusTrack | null => {
  const packets: OpusPacket[] = [];
  let channels = 1;
  let sampleRate = 48000;
  let codecPrivate: Uint8Array | undefined;
  let scaleNs = 1_000_000;
  let clusterTime = 0;
  let unsupported = false;

  const walk = (start: number, end: number) => {
    let pos = start;
    while (pos < end && !unsupported) {
      const id = readVint(bytes, pos, true);
      if (!id) return;
      const size = readVint(bytes, pos + id.len, false);
      if (!size) return;
      const dataStart = pos + id.len + size.len;
      const dataEnd = size.unknown ? end : Math.min(end, dataStart + size.value);
      if (MASTERS.has(id.value)) {
        walk(dataStart, dataEnd);
      } else if (id.value === ID.TimecodeScale) {
        scaleNs = readUint(bytes, dataStart, dataEnd) || scaleNs;
      } else if (id.value === ID.Channels) {
        channels = readUint(bytes, dataStart, dataEnd) || channels;
      } else if (id.value === ID.SamplingFrequency) {
        sampleRate = Math.round(readFloat(bytes, dataStart, dataEnd)) || sampleRate;
      } else if (id.value === ID.CodecPrivate) {
        codecPrivate = bytes.slice(dataStart, dataEnd);
      } else if (id.value === ID.Timecode) {
        clusterTime = readUint(bytes, dataStart, dataEnd);
      } else if (id.value === ID.SimpleBlock || id.value === ID.Block) {
        const track = readVint(bytes, dataStart, false);
        if (track) {
          const at = dataStart + track.len;
          let rel = (bytes[at] << 8) | bytes[at + 1];
          if (rel & 0x8000) rel -= 0x10000;
          const flags = bytes[at + 2];
          if (flags & 0x06) {
            unsupported = true; // laced blocks: not what MediaRecorder writes
            return;
          }
          packets.push({
            data: bytes.slice(at + 3, dataEnd),
            timestampUs: Math.round(((clusterTime + rel) * scaleNs) / 1000),
          });
        }
      }
      pos = dataEnd;
    }
  };
  walk(0, bytes.length);
  if (unsupported || packets.length === 0) return null;
  return { packets, channels, sampleRate, codecPrivate };
};

type WebCodecsGlobals = {
  AudioDecoder?: any;
  EncodedAudioChunk?: any;
};

/** Decodes a WebM/Opus clip with WebCodecs (Safari 16.4+ has it, with no WebM audio of its own). */
export const decodeWebmOpus = async (bytes: Uint8Array): Promise<Pcm | null> => {
  const g = globalThis as unknown as WebCodecsGlobals;
  if (!g.AudioDecoder || !g.EncodedAudioChunk) return null;
  const track = parseWebmOpus(bytes);
  if (!track) return null;

  const frames: Float32Array[][] = [];
  let failure: unknown = null;
  const decoder = new g.AudioDecoder({
    output: (data: any) => {
      const planes: Float32Array[] = [];
      for (let c = 0; c < data.numberOfChannels; c += 1) {
        const plane = new Float32Array(data.numberOfFrames);
        data.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
        planes.push(plane);
      }
      frames.push(planes);
      data.close();
    },
    error: (e: unknown) => {
      failure = e;
    },
  });
  try {
    decoder.configure({
      codec: 'opus',
      sampleRate: track.sampleRate,
      numberOfChannels: track.channels,
      ...(track.codecPrivate ? { description: track.codecPrivate } : {}),
    });
    for (const p of track.packets) {
      decoder.decode(
        new g.EncodedAudioChunk({ type: 'key', timestamp: p.timestampUs, data: p.data })
      );
    }
    await decoder.flush();
  } catch {
    return null;
  } finally {
    try {
      decoder.close();
    } catch {
      // Already closed after an error.
    }
  }
  if (failure || frames.length === 0) return null;

  const channelCount = frames[0].length;
  const total = frames.reduce((n, f) => n + f[0].length, 0);
  const channels: Float32Array[] = Array.from({ length: channelCount }, () => new Float32Array(total));
  let offset = 0;
  for (const f of frames) {
    for (let c = 0; c < channelCount; c += 1) channels[c].set(f[c], offset);
    offset += f[0].length;
  }
  return { channels, sampleRate: track.sampleRate };
};

/** Decodes with the browser's own decoder; null when it cannot. */
export const decodeWithAudioContext = async (buffer: ArrayBuffer): Promise<Pcm | null> => {
  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AudioCtx) return null;
  const context = new AudioCtx();
  try {
    const audio = await context.decodeAudioData(buffer);
    return {
      channels: Array.from({ length: audio.numberOfChannels }, (_, i) =>
        audio.getChannelData(i).slice()
      ),
      sampleRate: audio.sampleRate,
    };
  } catch {
    return null;
  } finally {
    void context.close();
  }
};

/** Samples of a clip: the browser's decoder first, then WebCodecs for WebM/Opus. */
export const decodeClipToPcm = async (buffer: ArrayBuffer, mime: string): Promise<Pcm | null> => {
  const viaContext = await decodeWithAudioContext(buffer.slice(0));
  if (viaContext) return viaContext;
  if (mime === 'audio/webm') return decodeWebmOpus(new Uint8Array(buffer));
  return null;
};

/** 16-bit PCM WAV: plays in every browser, whatever the original codec was. */
export const encodeWav = ({ channels, sampleRate }: Pcm): Blob => {
  const channelCount = channels.length;
  const frames = channels[0]?.length ?? 0;
  const dataSize = frames * channelCount * 2;
  const out = new DataView(new ArrayBuffer(44 + dataSize));
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) out.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  out.setUint32(4, 36 + dataSize, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, channelCount, true);
  out.setUint32(24, sampleRate, true);
  out.setUint32(28, sampleRate * channelCount * 2, true);
  out.setUint16(32, channelCount * 2, true);
  out.setUint16(34, 16, true);
  text(36, 'data');
  out.setUint32(40, dataSize, true);
  let at = 44;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < channelCount; c += 1) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      out.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([out.buffer], { type: 'audio/wav' });
};
