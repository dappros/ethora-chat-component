/**
 * Image URLs that reach the DOM (`<img src>`, CSS `url()`) can come from
 * user-controlled data: profile photos, message stanzas, link previews,
 * attachment locations. Anything that is not a plain web or blob image URL is
 * dropped here so the sink never receives an active or document-bearing URL.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'blob:']);

// Raster images only: no svg+xml (it can carry script), no text/html.
const SAFE_DATA_IMAGE_URL =
  /^data:image\/(png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/=]*$/i;

const baseForRelativeUrls = (): string => {
  if (typeof window === 'undefined') return 'http://localhost';
  const origin = window.location?.origin;
  return origin && origin !== 'null' ? origin : 'http://localhost';
};

/**
 * Returns the trimmed input when it is a safe image URL, otherwise ''.
 *
 * Allowed: absolute or relative (resolved against the page origin) http:,
 * https: and blob: URLs, and base64 data URLs of png, jpeg, gif, webp or
 * avif images. Blocked: javascript:, vbscript:, data:text/html, data:image/svg+xml
 * and anything that does not parse. Non-string input yields ''.
 */
export const safeImageUrl = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  if (!url) return '';

  if (/^data:/i.test(url)) {
    return SAFE_DATA_IMAGE_URL.test(url) ? url : '';
  }

  let parsed: URL;
  try {
    parsed = new URL(url, baseForRelativeUrls());
  } catch {
    return '';
  }
  return ALLOWED_PROTOCOLS.has(parsed.protocol) ? url : '';
};
