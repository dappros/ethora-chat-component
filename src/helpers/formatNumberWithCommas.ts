// Locale defaults to 'en-US' only when the caller doesn't know the UI
// locale. Prefer passing `useUiLocale()` from `i18n/useT` so a thousands
// separator renders the way the reader's own language expects instead of
// always the US convention (see DateLabel.tsx for the same pattern applied
// to dates).
export function formatNumberWithCommas(
  num: number | string,
  locale?: string
): string {
  return num.toLocaleString(locale ?? 'en-US');
}
