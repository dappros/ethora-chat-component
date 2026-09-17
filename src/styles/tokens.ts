import { useEffect, useMemo, type CSSProperties } from 'react';
import { IConfig, TypographyConfig } from '../types/types';

/**
 * Design tokens for the chat UI, published as CSS custom properties.
 *
 * `buildThemeTokens` derives the full token map from the host's
 * `config.colors` (and optionally `config.typography`), falling back to the
 * neutral defaults below when nothing is configured - so an integration that
 * sets no colors renders pixel-identical to the previous hardcoded values.
 *
 * Consumers (styled-components across the sidebar, login, empty states, ...)
 * read these with a literal fallback, e.g.
 *   `background: var(--ethora-color-primary-soft, #E7EDF9);`
 * so they keep working even before this module runs (SSR, tests that mount a
 * component in isolation, etc).
 */

// ---------------------------------------------------------------------------
// Hex color helpers (no external color library).
// ---------------------------------------------------------------------------

const HEX_RE = /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/;

const isValidHex = (hex: string): boolean => HEX_RE.test(hex.trim());

const normalizeHex = (hex: string): string => {
  let h = hex.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return h.toLowerCase();
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const h = normalizeHex(hex);
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
};

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

const rgbToHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b]
    .map((v) => clamp255(v).toString(16).padStart(2, '0'))
    .join('')}`;

/** Mix `hex` toward white by `amount` (0-1). Used for soft tints. */
export const tintColor = (hex: string, amount: number): string => {
  if (!isValidHex(hex)) return hex;
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount
  );
};

/** Mix `hex` toward black by `amount` (0-1). Used for hover/pressed shades. */
export const shadeColor = (hex: string, amount: number): string => {
  if (!isValidHex(hex)) return hex;
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS = {
  primary: '#0052CD',
  primarySoft: '#E7EDF9',
  text: '#141414',
  textSecondary: '#5A5F66',
  // WCAG AA sweep (2026-09): the old #8C8C8C only cleared 3.36:1 against
  // white, below the 4.5:1 a 12px timestamp needs. Darkened to the minimum
  // that also clears the darkest surface it actually renders on
  // (--ethora-color-bg-hover, #F0F2F5, on dropdown/list hover states) with a
  // small margin: 5.25:1 on bg, 4.89:1 on bg-subtle, 4.68:1 on bg-hover.
  // Still reads as a lighter, more muted gray than textSecondary.
  textMuted: '#6C6C6C',
  textOnPrimary: '#FFFFFF',
  bg: '#FFFFFF',
  bgSubtle: '#F5F7FA',
  bgHover: '#F0F2F5',
  border: '#E6E8EC',
  // Same sweep: #D92D20 passed as plain body text (4.83:1 on bg) but fell
  // to 4.31:1 on --ethora-color-bg-hover, which is exactly where it renders
  // for destructive dropdown items (Leave/Delete/Block) on hover. Nudged
  // down slightly (5.19:1 on bg, 4.83:1 on bg-subtle, 4.63:1 on bg-hover) -
  // still unmistakably the same red.
  danger: '#D02B1F',
  // Same sweep: #12B76A only reached 2.62:1 as text ("N online") and even
  // as the presence-dot graphic (3:1 needed) it fell short. This single
  // value backs both --ethora-color-success and --ethora-color-online (see
  // below), and both are used as real text somewhere (online counts/labels,
  // and the white glyph inside Toast's success badge), so both need the
  // 4.5:1 text threshold, not just the 3:1 graphic one - a second, lighter
  // token for the presence dot would still have had to be at least this
  // dark for that reason alone, so we kept one shared value rather than
  // adding a second token. Darkened to clear bg-hover (the darkest surface
  // this text sits on, e.g. a hovered member row): 5.26:1 on bg, 4.90:1 on
  // bg-subtle, 4.69:1 on bg-hover. Still clearly reads as "online green".
  success: '#0C7C48',
  iconsBg: '#FFFFFF',
} as const;

const DEFAULT_WEIGHTS = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export type ThemeTokenMap = Record<string, string>;

/**
 * Build the full `--ethora-*` CSS variable map from the host's config.
 * Pure function - safe to call outside the browser (SSR, tests).
 */
export function buildThemeTokens(
  colors?: IConfig['colors'],
  typography?: TypographyConfig
): ThemeTokenMap {
  const primary =
    colors?.primary && isValidHex(colors.primary)
      ? colors.primary
      : DEFAULTS.primary;
  const primaryHover = isValidHex(primary) ? shadeColor(primary, 0.08) : primary;
  const customPrimary = colors?.primary && isValidHex(colors.primary);
  // Derived from `primary` alone - NOT `ownMessageBackground`. This token
  // backs unrelated "soft" surfaces across the UI (the selected room row,
  // reply-quote panels, file chips, profile/settings accents), so a host
  // that sets only `ownMessageBackground` (to retint message bubbles) must
  // not also retint all of those. Own message bubbles get their background
  // from the separate `--ethora-own-message-bg` variable (see
  // resolveIconColor.ts's applyThemeColors), which is set directly from
  // `ownMessageBackground` and takes priority over this token in
  // CustomMessageBubble - so bubbles are unaffected by this change.
  const primarySoft = customPrimary ? tintColor(primary, 0.88) : DEFAULTS.primarySoft;

  const icons = colors?.icons || primary;
  const iconsBg = colors?.iconsBg || colors?.secondary || DEFAULTS.iconsBg;

  const weights = { ...DEFAULT_WEIGHTS, ...(typography?.weights ?? {}) };

  return {
    '--ethora-color-primary': primary,
    '--ethora-color-primary-hover': primaryHover,
    '--ethora-color-primary-soft': primarySoft,
    '--ethora-color-secondary': colors?.secondary || primary,
    '--ethora-color-icons': icons,
    '--ethora-color-icons-bg': iconsBg,
    '--ethora-color-text': DEFAULTS.text,
    '--ethora-color-text-secondary': DEFAULTS.textSecondary,
    '--ethora-color-text-muted': DEFAULTS.textMuted,
    '--ethora-color-text-on-primary': DEFAULTS.textOnPrimary,
    '--ethora-color-bg': DEFAULTS.bg,
    '--ethora-color-bg-subtle': DEFAULTS.bgSubtle,
    '--ethora-color-bg-hover': DEFAULTS.bgHover,
    '--ethora-color-border': DEFAULTS.border,
    '--ethora-color-danger': DEFAULTS.danger,
    '--ethora-color-success': DEFAULTS.success,
    '--ethora-color-online': DEFAULTS.success,

    '--ethora-radius-sm': '8px',
    '--ethora-radius-md': '12px',
    '--ethora-radius-lg': '16px',
    '--ethora-radius-full': '999px',

    '--ethora-shadow-sm': '0 1px 2px rgba(16,24,40,.06)',
    '--ethora-shadow-md': '0 4px 12px rgba(16,24,40,.10)',
    '--ethora-shadow-lg': '0 12px 32px rgba(16,24,40,.14)',

    // Width of the inset keyboard-focus ring on rounded, full-width rows
    // (the room list) - see ChatItem in styled/RoomListComponents. Kept as
    // its own token, not folded into a shadow default, so a host can turn
    // the ring up or down without redefining the whole box-shadow.
    '--ethora-focus-ring-width': '2px',

    '--ethora-space-1': '4px',
    '--ethora-space-2': '8px',
    '--ethora-space-3': '12px',
    '--ethora-space-4': '16px',
    '--ethora-space-5': '20px',
    '--ethora-space-6': '24px',

    '--ethora-motion-fast': '150ms',
    '--ethora-motion-base': '220ms',
    '--ethora-motion-ease': 'cubic-bezier(.2,.8,.2,1)',

    '--ethora-font-weight-regular': String(weights.regular),
    '--ethora-font-weight-medium': String(weights.medium),
    '--ethora-font-weight-semibold': String(weights.semibold),
    '--ethora-font-weight-bold': String(weights.bold),

    // Type scale. Several components (the side-drawer panels' section
    // labels, row titles and hints) already read `xs`/`sm`/`lg` with a
    // literal fallback baked into each call site - these values match those
    // existing fallbacks exactly, so publishing them here is additive: it
    // gives the scale one real source of truth instead of N duplicated
    // literals, with no visual change to anything already shipping. `md`
    // and `xl` are new steps, for a body-copy size and a "this is the
    // biggest text in the panel" hero size respectively - see
    // DrawerProfileParts.tsx's ProfileHeroName, the one place that uses
    // `xl`, deliberately, so the panel has exactly one clearly-largest line.
    '--ethora-font-size-xs': '12px',
    '--ethora-font-size-sm': '14px',
    '--ethora-font-size-md': '15px',
    '--ethora-font-size-lg': '18px',
    '--ethora-font-size-xl': '22px',

    // Line-height companions to the scale above, for multi-line text set in
    // it: `tight` for short, large, rarely-wrapping text (a hero name),
    // `normal` for a sentence or two of body copy (disclosure/hint text).
    '--ethora-line-height-tight': '1.25',
    '--ethora-line-height-normal': '1.5',
  };
}

/**
 * The class the chat's root element carries; useful for scoping global CSS.
 * Re-exported from `styles/classNames`, which owns every class name this
 * SDK writes into the DOM, so the literal exists in exactly one place.
 */
export { CHAT_ROOT_CLASS } from './classNames';

/**
 * Memoized React.CSSProperties built from the token map - spread this onto
 * the chat root element's inline `style` so the variables are scoped to the
 * chat subtree wherever the root can carry them.
 */
export function useThemeTokenStyle(
  colors?: IConfig['colors'],
  typography?: TypographyConfig
): CSSProperties {
  return useMemo(
    () => buildThemeTokens(colors, typography) as CSSProperties,
    [
      colors?.primary,
      colors?.secondary,
      colors?.icons,
      colors?.iconsBg,
      colors?.ownMessageBackground,
      JSON.stringify(typography?.weights ?? {}),
    ]
  );
}

/**
 * Publishes the token map on `document.documentElement` for content that
 * lives outside the chat subtree (portals) and for hosts that read
 * `--ethora-*` themselves.
 *
 * The chat root (ChatWrapperBox) carries the same variables inline, so this
 * global copy is a convenience layer, not the source of truth. It is kept
 * multi-instance safe: every mounted ThemeTokens registers its map, the most
 * recently mounted instance's tokens are the ones written, and on unmount
 * the entry is dropped and the remaining latest instance (if any) is
 * re-applied; with no instances left the variables are removed. Every name
 * is prefixed `--ethora-*`, so the host page is unaffected unless it reads
 * those names on purpose.
 */
const tokenInstances = new Map<number, ThemeTokenMap>();
let nextTokenInstanceId = 1;
let appliedTokenNames: string[] = [];

const syncDocumentTokens = () => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  appliedTokenNames.forEach((name) => root.style.removeProperty(name));
  appliedTokenNames = [];
  const latest = Array.from(tokenInstances.values()).pop();
  if (!latest) return;
  Object.entries(latest).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
  appliedTokenNames = Object.keys(latest);
};

export function ThemeTokens({
  config,
}: {
  config?: Pick<IConfig, 'colors' | 'typography'>;
}): null {
  const tokens = useMemo(
    () => buildThemeTokens(config?.colors, config?.typography),
    [
      config?.colors?.primary,
      config?.colors?.secondary,
      config?.colors?.icons,
      config?.colors?.iconsBg,
      config?.colors?.ownMessageBackground,
      JSON.stringify(config?.typography?.weights ?? {}),
    ]
  );
  const instanceId = useMemo(() => nextTokenInstanceId++, []);

  useEffect(() => {
    tokenInstances.set(instanceId, tokens);
    syncDocumentTokens();
    return () => {
      tokenInstances.delete(instanceId);
      syncDocumentTokens();
    };
  }, [instanceId, tokens]);

  return null;
}
