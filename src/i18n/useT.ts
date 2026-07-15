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
 *
 * When the host doesn't set `config.i18n.locale` explicitly, this falls
 * back to `langSource` - the same reader-language state the in-chat globe
 * picker (LanguageSelectorButton) and `config.translates.readerLocale`
 * drive (see useChatWrapperInit's resolveExternalReaderLocaleLangSource).
 * So picking a language in the chat changes both message translations AND
 * static captions together, as one language switch, unless the host is
 * explicitly managing UI locale separately via `config.i18n.locale`.
 */
export const useT = () => {
  const { config, langSource } = useChatSettingState();
  const locale = config?.i18n?.locale || langSource;
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
