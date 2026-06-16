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
const SIZE_VAR = '--ethora-font-size';
/** Derived size tokens: ratios of the base size used across the chat UI. */
const SIZE_VARIANTS: Array<{ suffix: string; ratio: number }> = [
  { suffix: '-xs', ratio: 0.75 }, // timestamps, hints (12px @ base 16)
  { suffix: '-sm', ratio: 0.875 }, // secondary text, badges (14px @ base 16)
  { suffix: '-lg', ratio: 1.125 }, // sender names, accents (18px @ base 16)
];

/** Default fallback stack appended when the host doesn't specify one. */
const FALLBACK_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * The family the chat should actually render in. Prefer an explicit
 * `fontFamily`, but fall back to `googleFontsFamily` so that hosts which only
 * pass `googleFontsFamily` (a common shorthand) still get the font applied to
 * message text and sender names — not just loaded.
 */
function resolveEffectiveFamily(cfg: TypographyConfig): string | undefined {
  return cfg.fontFamily?.trim() || cfg.googleFontsFamily?.trim() || undefined;
}

/** Resolve `fontSize` to a CSS length string (px when unitless), or undefined. */
function resolveBaseFontSize(fontSize?: number | string): number | undefined {
  if (fontSize == null) return undefined;
  const parsed =
    typeof fontSize === 'number' ? fontSize : parseFloat(String(fontSize));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

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
  const effectiveFamily = resolveEffectiveFamily(cfg);
  if (effectiveFamily) {
    const value = /,/.test(effectiveFamily)
      ? effectiveFamily
      : `'${effectiveFamily}', ${FALLBACK_STACK}`;
    document.documentElement.style.setProperty(FONT_VAR, value);
  } else {
    document.documentElement.style.removeProperty(FONT_VAR);
  }

  // 4. Publish the base font size + derived xs/sm/lg tokens. The chat's text
  // styles reference these with their previous hardcoded values as fallbacks,
  // so omitting `fontSize` keeps the chat pixel-identical to before.
  const basePx = resolveBaseFontSize(cfg.fontSize);
  if (basePx) {
    const round = (v: number) => Math.round(v * 100) / 100;
    document.documentElement.style.setProperty(SIZE_VAR, `${round(basePx)}px`);
    SIZE_VARIANTS.forEach(({ suffix, ratio }) => {
      document.documentElement.style.setProperty(
        `${SIZE_VAR}${suffix}`,
        `${round(basePx * ratio)}px`
      );
    });
  } else {
    document.documentElement.style.removeProperty(SIZE_VAR);
    SIZE_VARIANTS.forEach(({ suffix }) => {
      document.documentElement.style.removeProperty(`${SIZE_VAR}${suffix}`);
    });
  }
}

/** Remove everything {@link applyTypography} injected. */
export function clearTypography(): void {
  if (typeof document === 'undefined') return;
  document.getElementById(LINK_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.style.removeProperty(FONT_VAR);
  document.documentElement.style.removeProperty(SIZE_VAR);
  SIZE_VARIANTS.forEach(({ suffix }) => {
    document.documentElement.style.removeProperty(`${SIZE_VAR}${suffix}`);
  });
}
