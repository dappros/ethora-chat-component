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

  setVar(ICON_COLOR_VAR, config?.colors?.icons || config?.colors?.primary);
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
