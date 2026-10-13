/**
 * Pure sizing helpers for in-bubble media. Kept free of React and the DOM so
 * the rules (clamping, never upscaling, duration formatting) are testable.
 */

export const SOLO_IMAGE_MAX_WIDTH_PX = 320;
export const SOLO_IMAGE_MAX_HEIGHT_PX = 380;
/** Box used while a solo image's dimensions are still unknown: 4:3. */
export const SOLO_DEFAULT_BOX = { width: 320, height: 240 } as const;
/** Box used while a solo video's dimensions are unknown: 16:9. */
export const SOLO_VIDEO_DEFAULT_BOX = { width: 320, height: 180 } as const;

export interface MediaBox {
  width: number;
  height: number;
}

const isPositive = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Fit a natural size inside a max box, keeping its aspect ratio. Never
 * upscales: a picture smaller than the box keeps its natural size. Returns
 * null when either dimension is unknown or not positive.
 */
export const fitMediaBox = (
  naturalWidth: number | undefined,
  naturalHeight: number | undefined,
  maxWidth = SOLO_IMAGE_MAX_WIDTH_PX,
  maxHeight = SOLO_IMAGE_MAX_HEIGHT_PX
): MediaBox | null => {
  if (!isPositive(naturalWidth) || !isPositive(naturalHeight)) return null;
  const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
};

/** A picture whose longest side is below this is shown at its natural size. */
export const SOLO_TINY_MAX_SIDE_PX = 120;
/** Smallest frame drawn around a tiny picture. */
export const SOLO_MIN_FRAME_PX = 64;
/** Beyond this long:short ratio a picture is cropped rather than letterboxed. */
export const SOLO_EXTREME_RATIO = 3;
/** Shorter side of the box of an extreme-ratio picture. */
export const SOLO_MIN_SHORT_SIDE_PX = 96;
/** Largest upscale a cover crop may apply before the picture is centred instead. */
const MAX_COVER_UPSCALE = 1.5;

/**
 * How the picture sits in its box.
 *   fit     - same aspect ratio as the box, fills it.
 *   cover   - extreme ratio: fills the box and is gently cropped from the centre.
 *   natural - smaller than its frame: drawn at its own size, centred on a tile.
 */
export type SoloMode = 'fit' | 'cover' | 'natural';

export interface SoloBox {
  /** The frame (stage) size in CSS px. */
  width: number;
  height: number;
  /** The drawn picture size; equals the frame unless `mode` is natural. */
  imageWidth: number;
  imageHeight: number;
  mode: SoloMode;
}

/**
 * The size policy of a single picture in a bubble.
 *
 *  - Inside 320 x 380 at its own aspect ratio, never upscaled.
 *  - Tiny (longest side < 120): natural size on a tile of at least 64px.
 *  - Extreme ratio (beyond 3:1 or 1:3): the shorter side is lifted to 96px
 *    and the picture is cover-cropped (the viewer shows all of it).
 *
 * `ratioOnly` is for a size read from a downscaled preview: only its aspect
 * ratio is trusted, so the box is scaled up to the real maximum instead of
 * staying thumbnail-sized (which would jump when the full file arrives).
 * Returns null while a dimension is unknown.
 */
export const computeSoloBox = (
  naturalWidth: number | undefined,
  naturalHeight: number | undefined,
  options: { ratioOnly?: boolean } = {}
): SoloBox | null => {
  if (!isPositive(naturalWidth) || !isPositive(naturalHeight)) return null;
  const w = naturalWidth;
  const h = naturalHeight;
  const ratioOnly = Boolean(options.ratioOnly);

  if (!ratioOnly && Math.max(w, h) < SOLO_TINY_MAX_SIDE_PX) {
    const imageWidth = Math.max(1, Math.round(w));
    const imageHeight = Math.max(1, Math.round(h));
    return {
      width: Math.max(imageWidth, SOLO_MIN_FRAME_PX),
      height: Math.max(imageHeight, SOLO_MIN_FRAME_PX),
      imageWidth,
      imageHeight,
      mode: 'natural',
    };
  }

  const fitScale = Math.min(
    ratioOnly ? Infinity : 1,
    SOLO_IMAGE_MAX_WIDTH_PX / w,
    SOLO_IMAGE_MAX_HEIGHT_PX / h
  );
  const fw = Math.max(1, Math.round(w * fitScale));
  const fh = Math.max(1, Math.round(h * fitScale));

  const ratio = w / h;
  const extreme = ratio > SOLO_EXTREME_RATIO || ratio < 1 / SOLO_EXTREME_RATIO;
  if (extreme && Math.min(fw, fh) < SOLO_MIN_SHORT_SIDE_PX) {
    const wide = fw >= fh;
    const width = wide ? fw : SOLO_MIN_SHORT_SIDE_PX;
    const height = wide ? SOLO_MIN_SHORT_SIDE_PX : fh;
    const coverScale = SOLO_MIN_SHORT_SIDE_PX / Math.min(w, h);
    if (!ratioOnly && coverScale > MAX_COVER_UPSCALE) {
      // Cropping would blow a small strip up: keep it at its fitted size.
      return { width, height, imageWidth: fw, imageHeight: fh, mode: 'natural' };
    }
    return { width, height, imageWidth: width, imageHeight: height, mode: 'cover' };
  }

  return { width: fw, height: fh, imageWidth: fw, imageHeight: fh, mode: 'fit' };
};

/** Parses a dimension that may arrive as a number or a numeric string. */
export const parseDimension = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  return isPositive(n as number | undefined) ? (n as number) : undefined;
};

/**
 * Formats a duration in seconds as m:ss, or h:mm:ss past one hour. Returns
 * an empty string when the value is missing or not a positive number, so
 * callers can skip the chip entirely.
 */
export const formatDuration = (seconds: string | number | undefined): string => {
  const total = typeof seconds === 'string' ? Number.parseFloat(seconds) : seconds;
  if (!isPositive(total)) return '';
  const whole = Math.floor(total);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
};
