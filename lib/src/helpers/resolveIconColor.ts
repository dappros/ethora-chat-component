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

/**
 * Publish the resolved icon colour on the `--ethora-icon-color` CSS variable.
 * Chrome icons default their `fill`/`stroke` to `var(--ethora-icon-color, …)`,
 * so setting this themes every neutral icon at once without touching call
 * sites. When neither `colors.icons` nor `colors.primary` is set, the variable
 * is removed and each icon falls back to its own literal default.
 *
 * Semantic icons (destructive red, status ticks, brand) intentionally keep
 * their literal colours and ignore this variable. SSR-safe (no-op without DOM).
 */
export const applyIconColor = (
  config?: Pick<IConfig, 'colors'> | null
): void => {
  if (typeof document === 'undefined') return;
  const explicit = config?.colors?.icons || config?.colors?.primary;
  if (explicit) {
    document.documentElement.style.setProperty(ICON_COLOR_VAR, explicit);
  } else {
    document.documentElement.style.removeProperty(ICON_COLOR_VAR);
  }
};
