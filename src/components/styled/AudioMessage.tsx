import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import type WaveSurfer from 'wavesurfer.js';
import { useSelector } from 'react-redux';
import { PauseIcon, PlayIcon } from '../../assets/icons';
import { RootState } from '../../roomStore';
import { useT } from '../../i18n/useT';

interface AudioMessageProps {
  src: string;
}

const SPEEDS = [1, 1.5, 2];
const BAR_WIDTH = 3;
const BAR_GAP = 2;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 240px;
  z-index: 1;
`;

const PlayButton = styled.button`
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: var(--ethora-radius-full, 999px);
  background-color: var(--ethora-color-primary, #0052cd);
  color: var(--ethora-color-text-on-primary, #ffffff);
  cursor: pointer;
  transition: background-color var(--ethora-motion-fast, 150ms);

  &:hover:not(:disabled) {
    background-color: var(--ethora-color-primary-hover, #0046ae);
  }
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
  svg {
    width: 16px;
    height: 16px;
  }
`;

const Track = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const WaveBox = styled.div`
  position: relative;
  width: 100%;
  /* Reserved before the clip decodes, so the bubble does not resize under
     the reader when the wave appears. */
  min-height: 28px;
`;

const Wave = styled.div`
  width: 100%;
`;

const WavePlaceholder = styled.div`
  position: absolute;
  inset: 0;
  height: 28px;
  border-radius: var(--ethora-radius-full, 999px);
  background: repeating-linear-gradient(
    to right,
    var(--ethora-color-border, #e6e8ec) 0 3px,
    transparent 3px 5px
  );
  opacity: 0.7;
  align-self: center;
  width: 100%;
  /* Middle band only, so the resting state reads as "waveform loading"
     rather than a solid rule. */
  mask-image: linear-gradient(to bottom, transparent 35%, #000 35% 65%, transparent 65%);
`;

const Time = styled.span`
  font-size: var(--ethora-font-size-xs, 11px);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  color: var(--ethora-color-text-secondary, #5a5f66);
`;

const Speed = styled.button`
  flex: 0 0 auto;
  min-width: 34px;
  padding: 3px 7px;
  border: none;
  border-radius: var(--ethora-radius-full, 999px);
  background-color: var(--ethora-color-bg, #ffffff);
  color: var(--ethora-color-text-secondary, #5a5f66);
  font-size: var(--ethora-font-size-xs, 11px);
  font-weight: var(--ethora-font-weight-medium, 500);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  opacity: 0.9;
  transition: opacity var(--ethora-motion-fast, 150ms);

  &:hover:not(:disabled) {
    opacity: 1;
  }
  &:disabled {
    cursor: default;
    opacity: 0.5;
  }
`;

/** `0:07`, `1:23`, `12:05`. Empty while the clip has not decoded yet. */
const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * wavesurfer paints into a canvas, and a canvas fill takes a concrete
 * colour - it cannot read `var(--ethora-color-primary)` or `color-mix()`
 * portably. So the colours are resolved off the DOM and mixed here.
 */
type Rgb = { r: number; g: number; b: number };

const parseColor = (value: string): Rgb | null => {
  const text = String(value || '').trim();
  const hex = text.startsWith('#') ? text.slice(1) : '';
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  if (full.length === 6 && /^[0-9a-f]{6}$/i.test(full)) {
    const num = parseInt(full, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  const parts = text.match(/^rgba?\(([^)]+)\)$/i);
  if (!parts) return null;
  const [r, g, b, a] = parts[1]
    .split(/[,/\s]+/)
    .filter(Boolean)
    .map((piece) => parseFloat(piece));
  if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
  // A fully transparent computed background is "not painted here", which
  // the caller has to keep walking up for - not a colour.
  if (Number.isFinite(a) && a === 0) return null;
  return { r, g, b };
};

const toCss = ({ r, g, b }: Rgb): string =>
  `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

const mix = (a: Rgb, b: Rgb, amount: number): Rgb => ({
  r: a.r + (b.r - a.r) * amount,
  g: a.g + (b.g - a.g) * amount,
  b: a.b + (b.b - a.b) * amount,
});

const relativeLuminance = ({ r, g, b }: Rgb): number => {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrastRatio = (a: Rgb, b: Rgb): number => {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x
  );
  return (light + 0.05) / (dark + 0.05);
};

/**
 * The colour actually painted behind the wave: the first ancestor with a
 * background of its own. It matters because an OWN message bubble is a tint
 * of the brand colour, so "draw the wave in the brand colour" - which is
 * what the neutral grey it used to use was replaced with - disappears into
 * exactly the bubble the sender looks at most.
 */
const resolveSurface = (node: HTMLElement): Rgb => {
  let current: HTMLElement | null = node;
  while (current) {
    const parsed = parseColor(getComputedStyle(current).backgroundColor);
    if (parsed) return parsed;
    current = current.parentElement;
  }
  return { r: 255, g: 255, b: 255 };
};

/**
 * Played and unplayed bar colours for whatever this bubble turned out to
 * be. The brand colour leads when it can be seen against the bubble; when
 * it cannot (own-message bubbles, and any host whose primary is close to
 * its own surface) the bubble's text colour takes over, which is readable
 * on that surface by definition. Unplayed bars are the same colour mixed
 * halfway into the surface, so they read as "the rest of the clip" rather
 * than as a different element.
 */
export const resolveWaveColors = (
  primary: string,
  text: string,
  surface: Rgb
): { wave: string; progress: string } => {
  const brand = parseColor(primary);
  const ink = parseColor(text) || { r: 20, g: 20, b: 20 };
  const progress =
    brand && contrastRatio(brand, surface) >= MIN_BAR_CONTRAST ? brand : ink;
  return {
    progress: toCss(progress),
    wave: toCss(mix(progress, surface, 0.52)),
  };
};

/**
 * 2.2:1, not a WCAG text threshold: these are bars, not glyphs, and the
 * played part only has to be separable from the bubble under them. Anything
 * flatter than this is the "where is the waveform" report this fixes.
 */
const MIN_BAR_CONTRAST = 2.2;

/**
 * Bars for one voice note.
 *
 * NOT the peak envelope wavesurfer draws by itself. Measured on a real QA
 * recording: two transients hit 0.98 and 0.99 while the speech around them
 * sits at an RMS of 0.002 to 0.058. Scaled against the peak, those two
 * samples own the whole 28px and every other bar collapses to a hairline -
 * the "faint dashed line with a couple of spikes" look these bubbles had.
 *
 * So: RMS per bucket (what the ear hears, not the worst sample), scaled
 * against the 95th percentile so a single click cannot set the scale, then
 * a square-root curve because loudness is perceived that way, and a floor
 * so a quiet passage still reads as a bar rather than as nothing.
 */
export const buildWaveformPeaks = (
  samples: Float32Array,
  barCount: number
): number[] => {
  const bars = Math.max(1, Math.floor(barCount));
  const bucket = Math.floor(samples.length / bars);
  if (bucket < 1) return new Array(bars).fill(MIN_BAR);

  const rms: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    let sum = 0;
    for (let j = i * bucket; j < (i + 1) * bucket; j += 1) {
      sum += samples[j] * samples[j];
    }
    rms.push(Math.sqrt(sum / bucket));
  }

  const sorted = [...rms].sort((a, b) => a - b);
  const reference =
    sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1] || 0;
  if (reference <= 0) return new Array(bars).fill(MIN_BAR);

  return rms.map((value) => {
    const scaled = Math.sqrt(Math.min(value / reference, 1));
    return Math.min(1, MIN_BAR + scaled * (1 - MIN_BAR));
  });
};

/** Floor for a bar, as a fraction of the box: silence is still a dot. */
const MIN_BAR = 0.08;

/**
 * Decode the clip once to build those peaks, and to learn its real length.
 * Both matter: MediaRecorder writes WebM without a duration header, so the
 * <audio> element reports Infinity for exactly the files this chat records.
 * Failure is not fatal - the caller falls back to letting wavesurfer fetch
 * and draw the file the old way.
 */
const analyseClip = async (
  url: string,
  barCount: number
): Promise<{ peaks: number[]; duration: number } | null> => {
  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!AudioCtx) return null;

  const context = new AudioCtx();
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    return {
      peaks: buildWaveformPeaks(buffer.getChannelData(0), barCount),
      duration: buffer.duration,
    };
  } catch {
    return null;
  } finally {
    void context.close();
  }
};

const AudioMessage: React.FC<AudioMessageProps> = ({ src }) => {
  const config = useSelector(
    (state: RootState) => state.chatSettingStore.config
  );
  const t = useT();

  const waveformRef = useRef<HTMLDivElement | null>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    // wavesurfer.js is loaded on demand: audio messages are rare enough
    // that the library shouldn't sit in the initial bundle.
    let disposed = false;

    import('wavesurfer.js').then(({ default: WaveSurferLib }) => {
      if (disposed || !waveformRef.current) return;

      // Resolved on the waveform node itself (inside the chat root, which
      // carries the active scheme's tokens) rather than on <html>, so the
      // wave follows this chat's light/dark scheme.
      const style =
        typeof window !== 'undefined'
          ? getComputedStyle(waveformRef.current)
          : null;
      const readToken = (name: string, fallback: string) =>
        style?.getPropertyValue(name)?.trim() || fallback;

      const { wave, progress } = resolveWaveColors(
        readToken('--ethora-color-primary', config?.colors?.primary || '#0052CD'),
        style?.color || readToken('--ethora-color-text', '#141414'),
        resolveSurface(waveformRef.current)
      );

      const instance = WaveSurferLib.create({
        container: waveformRef.current,
        waveColor: wave,
        progressColor: progress,
        cursorColor: 'transparent',
        cursorWidth: 0,
        height: 28,
        barWidth: BAR_WIDTH,
        barGap: BAR_GAP,
        barRadius: 3,
        // `peaks` below are already scaled to fill the box, so wavesurfer
        // must not rescale them again.
        normalize: false,
      });
      wavesurfer.current = instance;

      // Handlers BEFORE load(): a cached clip can decode and emit 'ready'
      // in the same tick, and a listener attached after that never hears it -
      // which leaves the bubble stuck on its loading placeholder forever.
      instance.on('ready', () => {
        setIsReady(true);
        setDuration(instance.getDuration());
      });
      instance.on('timeupdate', (time: number) => setCurrentTime(time));
      // Driven by the player's own events rather than toggled optimistically
      // in the click handler: a clip that ends, fails to decode or is paused
      // by the browser used to leave the button showing "pause" forever.
      instance.on('play', () => setIsPlaying(true));
      instance.on('pause', () => setIsPlaying(false));
      instance.on('finish', () => {
        setIsPlaying(false);
        // Back to the start, so the next press replays instead of doing
        // nothing with a full progress bar on screen.
        instance.seekTo(0);
        setCurrentTime(0);
      });
      instance.on('interaction', () => {
        void instance.play();
      });

      // Draw our own bars when the clip can be decoded, and hand wavesurfer
      // the duration with them so it never has to ask the media element for
      // a number that WebM recordings do not carry. Everything else falls
      // back to the plain load.
      const barSlot = BAR_WIDTH + BAR_GAP;
      const width = waveformRef.current?.clientWidth || 160;
      analyseClip(src, Math.max(16, Math.round(width / barSlot)))
        .then((analysis) => {
          if (disposed || wavesurfer.current !== instance) return;
          if (analysis) {
            void instance.load(src, [analysis.peaks], analysis.duration);
          } else {
            void instance.load(src);
          }
        })
        .catch(() => {
          if (!disposed && wavesurfer.current === instance) void instance.load(src);
        });
    });

    return () => {
      disposed = true;
      wavesurfer.current?.destroy();
      wavesurfer.current = null;
    };
  }, [src, config?.colors?.primary]);

  const togglePlayPause = useCallback(() => {
    void wavesurfer.current?.playPause();
  }, []);

  const changeSpeed = useCallback(() => {
    const instance = wavesurfer.current;
    if (!instance) return;
    const next = SPEEDS[(SPEEDS.indexOf(playbackRate) + 1) % SPEEDS.length];
    setPlaybackRate(next);
    instance.setPlaybackRate(next);
  }, [playbackRate]);

  // Counts up while playing, shows the clip's length at rest - the same
  // thing every other voice-note UI does, and the reason this bubble used
  // to say nothing at all about how long the recording is.
  const timeLabel = isReady
    ? formatTime(currentTime > 0 ? currentTime : duration)
    : '';

  return (
    <Row>
      <PlayButton
        type="button"
        onClick={togglePlayPause}
        disabled={!isReady}
        aria-label={t(isPlaying ? 'media.audioPause' : 'media.audioPlay')}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </PlayButton>
      <Track>
        <WaveBox aria-hidden="true">
          <Wave ref={waveformRef} />
          {!isReady && <WavePlaceholder />}
        </WaveBox>
        {timeLabel && <Time>{timeLabel}</Time>}
      </Track>
      <Speed
        type="button"
        onClick={changeSpeed}
        disabled={!isReady}
        aria-label={t('media.audioSpeed')}
      >
        {playbackRate}&times;
      </Speed>
    </Row>
  );
};

export default AudioMessage;
