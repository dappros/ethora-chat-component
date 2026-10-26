import { useEffect, useRef } from 'react';
import { TypographyConfig } from '../types/models/config.model';
import { applyTypography, clearTypography } from '../helpers/applyTypography';

/**
 * Loads and applies the host-provided font configuration whenever it changes.
 * Wired into the chat root (ReduxWrapper) so the font is in place before the
 * UI paints. No-op when `typography` is undefined - the default system font
 * stack is kept, so existing integrations are unaffected.
 *
 * When `typography` goes away on a mounted chat (the operator cleared the
 * font in the admin tab), what this hook applied is removed again and the
 * default stack is back, with no reload.
 */
export function useTypography(typography?: TypographyConfig): void {
  const applied = useRef(false);
  useEffect(() => {
    if (!typography && applied.current) {
      clearTypography();
      applied.current = false;
      return;
    }
    if (typography) applied.current = true;
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
