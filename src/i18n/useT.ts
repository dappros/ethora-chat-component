import { useCallback, useMemo } from 'react';
import { useChatSettingState } from '../hooks/useChatSettingState';
import { interpolate, resolveStringTable } from './strings';

/**
 * UI translation hook. Reads the active locale + host overrides from
 * `config.i18n` and returns a `t(key, vars?)` function.
 *
 *   const t = useT();
 *   <SearchInput placeholder={t('search.placeholder')} />
 *   <span>{t('presence.onlineCount', { count })}</span>
 *
 * Locale resolves to the base language for captions (region is only used for
 * message translation). Missing keys fall back to English, then to the raw
 * key, so nothing ever renders blank.
 */
export const useT = () => {
  const { config } = useChatSettingState();
  const locale = config?.i18n?.locale;
  const overrides = config?.i18n?.strings;

  const table = useMemo(
    () => resolveStringTable(locale, overrides),
    [locale, overrides]
  );

  return useCallback(
    (key: string, vars?: Record<string, string | number>): string =>
      interpolate(table[key] ?? key, vars),
    [table]
  );
};
