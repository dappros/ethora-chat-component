/**
 * Pure sizing helpers for in-bubble media. Kept free of React and the DOM so
 * the rules (clamping, never upscaling, duration formatting) are testable.
 */

/**
 * Reference box a solo picture is fitted into. It is the largest the
 * responsive media width ever gets (see MEDIA_WIDTH_CSS), so a picture is
 * never upscaled past what the widest pane could show; the real, smaller cap
 * for the current pane is applied in CSS from the shared width variable.
 */
export const SOLO_IMAGE_MAX_WIDTH_PX = 560;
export const SOLO_IMAGE_MAX_HEIGHT_PX = 784;
/** Box used while a solo image's dimensions are still unknown: 4:3. */
export const SOLO_DEFAULT_BOX = { width: 560, height: 420 } as const;
/** Box used while a solo video's dimensions are unknown: 16:9. */
export const SOLO_VIDEO_DEFAULT_BOX = { width: 560, height: 315 } as const;

/**
 * The ONE width of the media block of a message: the album grid, a solo
 * picture or video and the file cards under them all share it.
 *
 * `--ethora-pane-w` is the width of the message list pane (not the
 * viewport), written by the message list's ResizeObserver, so a chat embedded
 * in a narrow host sizes itself to that host. A container query would do the
 * same, but `container-type` contains layout, which turns the list into the
 * containing block of the context menu's `position: fixed` overlay.
 *
 *   pane 390   -> 300 (the bubble then clips it to its own width)
 *   pane 700   -> 340
 *   pane 1000  -> 430
 *   pane 1400  -> 550
 *   pane 1600+ -> 560
 */
export const MEDIA_WIDTH_VAR = '--ethora-media-w';
export const PANE_WIDTH_VAR = '--ethora-pane-w';
export const MEDIA_WIDTH_RULE =
  'clamp(300px, calc(var(--ethora-pane-w, 800px) * 0.3 + 130px), 560px)';
/** Use inside a stylesheet or inline style; falls back when the list did not set it. */
export const MEDIA_WIDTH_CSS = 'var(--ethora-media-w, 340px)';
/** A lone file card is capped so it does not become a giant bar. */
export const FILE_ONLY_MAX_WIDTH_PX = 360;
/** Tallest a solo picture gets, relative to the media width. */
export const SOLO_MAX_HEIGHT_FACTOR = 1.4;
/** CSS length of the tallest a solo picture may be: 60vh, or 1.4 x the media width. */
export const SOLO_MAX_HEIGHT_CSS = `min(60vh, calc(${SOLO_MAX_HEIGHT_FACTOR} * ${MEDIA_WIDTH_CSS}))`;

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
  maxWidth = 320,
  maxHeight = 380
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
 *  - Inside the max box (560 x 784 by default) at its own aspect ratio,
 *    never upscaled. CSS narrows it to the pane's media width and height.
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
  options: { ratioOnly?: boolean; maxWidth?: number; maxHeight?: number } = {}
): SoloBox | null => {
  if (!isPositive(naturalWidth) || !isPositive(naturalHeight)) return null;
  const w = naturalWidth;
  const h = naturalHeight;
  const ratioOnly = Boolean(options.ratioOnly);
  const maxWidth = isPositive(options.maxWidth) ? options.maxWidth : SOLO_IMAGE_MAX_WIDTH_PX;
  const maxHeight = isPositive(options.maxHeight) ? options.maxHeight : SOLO_IMAGE_MAX_HEIGHT_PX;

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
    maxWidth / w,
    maxHeight / h
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
