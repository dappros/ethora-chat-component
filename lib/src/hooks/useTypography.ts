import { useEffect } from 'react';
import { TypographyConfig } from '../types/models/config.model';
import { applyTypography } from '../helpers/applyTypography';

/**
 * Loads and applies the host-provided font configuration whenever it changes.
 * Wired into the chat root (ReduxWrapper) so the font is in place before the
 * UI paints. No-op when `typography` is undefined — the default system font
 * stack is kept, so existing integrations are unaffected.
 */
export function useTypography(typography?: TypographyConfig): void {
  useEffect(() => {
    applyTypography(typography);
    // Re-run when any meaningful field changes.
  }, [
    typography?.fontFamily,
    typography?.fontSize,
    typography?.googleFontsUrl,
    typography?.googleFontsFamily,
    JSON.stringify(typography?.fontFaces ?? []),
    JSON.stringify(typography?.weights ?? {}),
  ]);
}
