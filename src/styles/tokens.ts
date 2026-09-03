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
  textMuted: '#8C8C8C',
  textOnPrimary: '#FFFFFF',
  bg: '#FFFFFF',
  bgSubtle: '#F5F7FA',
  bgHover: '#F0F2F5',
  border: '#E6E8EC',
  danger: '#D92D20',
  success: '#12B76A',
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
  const primarySoft =
    colors?.ownMessageBackground && isValidHex(colors.ownMessageBackground)
      ? colors.ownMessageBackground
      : customPrimary
        ? tintColor(primary, 0.88)
        : DEFAULTS.primarySoft;

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
  };
}

/** The class the chat's root element carries; useful for scoping global CSS. */
export const CHAT_ROOT_CLASS = 'ethora-chat-root';

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
 * Mirrors the token map onto `document.documentElement` as an effect.
 *
 * Why the document root and not just the chat root: content rendered through
 * `createPortal` (e.g. `LanguageSelectorModal`) mounts directly on
 * `document.body`, outside the chat's own DOM subtree, so an inline style on
 * the chat root alone would not reach it. This mirrors the same pattern this
 * codebase already uses for the equivalent problem (see
 * `helpers/applyTypography.ts` and `helpers/resolveIconColor.ts`'s
 * `applyThemeColors`, both of which publish their variables on
 * `document.documentElement`): every variable here is prefixed
 * `--ethora-*` and only ever read back by this chat's own styled components,
 * so declaring it on the document root cannot visually affect the host page
 * - it cannot leak unless the host happens to consume an identically named
 * `--ethora-*` variable itself, which is exactly the situation
 * `applyTypography`/`applyThemeColors` already accept.
 *
 * `ThemeTokens` renders nothing; mount it once near the top of the tree
 * (see `ReduxWrapper.tsx`) alongside the other config-driven "Enabler"
 * components.
 */
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

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    Object.entries(tokens).forEach(([name, value]) => {
      root.style.setProperty(name, value);
    });
    // Intentionally not removed on unmount: the chat is typically mounted
    // for the app's lifetime, and other Enablers (applyTypography,
    // applyThemeColors) follow the same "set, don't tear down" contract.
  }, [tokens]);

  return null;
}
