import { TypographyConfig } from '../types/models/config.model';

/**
 * Runtime font loader for the chat component.
 *
 * Given a {@link TypographyConfig}, this:
 *  1. injects a Google Fonts <link> (from `googleFontsUrl` or `googleFontsFamily`),
 *  2. injects `@font-face` rules for any self-hosted `fontFaces` (e.g. e-Ukraine),
 *  3. publishes the chosen family on the `--ethora-font-family` CSS variable,
 *     which `index.css` references as the chat's base font.
 *
 * It is idempotent: re-applying the same config replaces the previously
 * injected nodes rather than appending duplicates. Safe to call on every
 * config change. No-op outside the browser (SSR-safe).
 */

const STYLE_ID = 'ethora-typography-faces';
const LINK_ID = 'ethora-typography-google';
const FONT_VAR = '--ethora-font-family';

/** Default fallback stack appended when the host doesn't specify one. */
const FALLBACK_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function buildGoogleUrl(cfg: TypographyConfig): string | undefined {
  if (cfg.googleFontsUrl) return cfg.googleFontsUrl;
  if (!cfg.googleFontsFamily) return undefined;
  const w = cfg.weights ?? {};
  const weights = Array.from(
    new Set(
      [w.regular ?? 400, w.medium ?? 500, w.semibold ?? 600, w.bold ?? 700].map(
        Number
      )
    )
  ).sort((a, b) => a - b);
  const family = cfg.googleFontsFamily.trim().replace(/\s+/g, '+');
  return `https://fonts.googleapis.com/css2?family=${family}:wght@${weights.join(
    ';'
  )}&display=swap`;
}

function buildFontFaceCss(cfg: TypographyConfig): string {
  if (!cfg.fontFaces?.length) return '';
  return cfg.fontFaces
    .map((f) => {
      const format = /\.woff2($|\?)/i.test(f.src)
        ? 'woff2'
        : /\.woff($|\?)/i.test(f.src)
          ? 'woff'
          : /\.otf($|\?)/i.test(f.src)
            ? 'opentype'
            : 'truetype';
      return `@font-face {
  font-family: '${f.family}';
  src: url('${f.src}') format('${format}');
  font-weight: ${f.weight ?? 400};
  font-style: ${f.style ?? 'normal'};
  font-display: ${f.display ?? 'swap'};
}`;
    })
    .join('\n');
}

export function applyTypography(cfg?: TypographyConfig): void {
  if (typeof document === 'undefined') return;
  if (!cfg) return;

  // 1. Google Fonts stylesheet
  const googleUrl = buildGoogleUrl(cfg);
  let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (googleUrl) {
    if (!link) {
      link = document.createElement('link');
      link.id = LINK_ID;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== googleUrl) link.href = googleUrl;
  } else if (link) {
    link.remove();
  }

  // 2. Self-hosted @font-face rules
  const faceCss = buildFontFaceCss(cfg);
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (faceCss) {
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    if (style.textContent !== faceCss) style.textContent = faceCss;
  } else if (style) {
    style.remove();
  }

  // 3. Publish the chosen family on the CSS variable the chat reads.
  if (cfg.fontFamily) {
    const value = /,/.test(cfg.fontFamily)
      ? cfg.fontFamily
      : `'${cfg.fontFamily}', ${FALLBACK_STACK}`;
    document.documentElement.style.setProperty(FONT_VAR, value);
  } else {
    document.documentElement.style.removeProperty(FONT_VAR);
  }
}

/** Remove everything {@link applyTypography} injected. */
export function clearTypography(): void {
  if (typeof document === 'undefined') return;
  document.getElementById(LINK_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.style.removeProperty(FONT_VAR);
}
