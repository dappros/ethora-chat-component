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
