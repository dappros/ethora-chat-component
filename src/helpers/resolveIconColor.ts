import { IConfig } from '../types/types';

/** Fallback icon colour when neither `colors.icons` nor `colors.primary` is set. */
const DEFAULT_ICON_COLOR = '#0052CD';

/**
 * Resolve the colour to use for the chat's icons.
 *
 * Priority: explicit `config.colors.icons` → `config.colors.primary` →
 * the historical default (#0052CD). Lets a host theme every icon at once by
 * setting `colors.primary`, while still allowing icons to be decoupled via
 * `colors.icons`.
 */
export const resolveIconColor = (
  config?: Pick<IConfig, 'colors'> | null
): string =>
  config?.colors?.icons || config?.colors?.primary || DEFAULT_ICON_COLOR;

/** CSS variable read by the chat's chrome icons as their default colour. */
export const ICON_COLOR_VAR = '--ethora-icon-color';

/** CSS variables the chat's styled components read for themeable surfaces. */
const OWN_MSG_BG_VAR = '--ethora-own-message-bg';
const OTHER_MSG_BG_VAR = '--ethora-other-message-bg';
const INPUT_BG_VAR = '--ethora-input-bg';
const CHAT_BG_VAR = '--ethora-chat-bg';
const CHAT_BG_IMAGE_VAR = '--ethora-chat-bg-image';

const setVar = (name: string, value?: string | null): void => {
  if (value) {
    document.documentElement.style.setProperty(name, value);
  } else {
    document.documentElement.style.removeProperty(name);
  }
};

// Bulletproof icon tinting. The chat's chrome icons are authored with
// `fill="var(--ethora-icon-color, …)"` / `stroke="var(--ethora-icon-color, …)"`.
// A bare presentation attribute loses to ANY host CSS rule on `svg`/`path`, so
// `colors.icons` could be silently overridden by the embedding app's
// stylesheet. We instead inject an `!important` rule that targets exactly those
// attribute-marked elements with the *resolved* colour. Because:
//   - it matches only `fill="var(--ethora-icon-color…"` (white sub-shapes use
//     `fill="white"` and semantic icons use literal hexes, so they're untouched),
//   - it uses `!important` + attribute-selector specificity,
// it overrides normal host CSS and even host `!important` on plain element
// selectors. Removed entirely when no icon colour is configured, so default
// theming is unchanged.
const ICON_TINT_STYLE_ID = 'ethora-icon-tint';

const applyIconTint = (color?: string | null): void => {
  let style = document.getElementById(
    ICON_TINT_STYLE_ID
  ) as HTMLStyleElement | null;
  if (!color) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = ICON_TINT_STYLE_ID;
    document.head.appendChild(style);
  }
  const css =
    `[fill^="var(${ICON_COLOR_VAR}"]{fill:${color} !important;}` +
    `[stroke^="var(${ICON_COLOR_VAR}"]{stroke:${color} !important;}`;
  if (style.textContent !== css) style.textContent = css;
};

/**
 * Publish host theme colours as CSS variables that the chat's styled
 * components read with their historical defaults as fallbacks. Covers icons,
 * own/other message bubble backgrounds, the input bar, and the chat
 * background (`backgroundChat.color` / `.image`).
 *
 * Setting nothing keeps the chat pixel-identical (each var resolves to its
 * literal fallback). SSR-safe (no-op without DOM). Semantic icons (destructive
 * red, status ticks, brand) intentionally ignore the icon variable.
 */
export const applyThemeColors = (
  config?: Pick<IConfig, 'colors' | 'backgroundChat'> | null
): void => {
  if (typeof document === 'undefined') return;

  const iconColor = config?.colors?.icons || config?.colors?.primary;
  setVar(ICON_COLOR_VAR, iconColor);
  // Lock the icon colour so the embedding app's CSS can't override it.
  applyIconTint(iconColor);
  setVar(OWN_MSG_BG_VAR, config?.colors?.ownMessageBackground);
  setVar(OTHER_MSG_BG_VAR, config?.colors?.otherMessageBackground);
  setVar(INPUT_BG_VAR, config?.colors?.inputBackground);

  setVar(CHAT_BG_VAR, config?.backgroundChat?.color);
  const image = config?.backgroundChat?.image;
  // Only string URLs can be expressed as a CSS variable; a File must be
  // turned into an object URL by the host before being passed here.
  setVar(
    CHAT_BG_IMAGE_VAR,
    typeof image === 'string' && image ? `url("${image}")` : undefined
  );
};

/** @deprecated use {@link applyThemeColors}; kept for backwards compatibility. */
export const applyIconColor = applyThemeColors;
