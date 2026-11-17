export interface Translation {
  translatedText: string;
  language: string;
  languageName: string;
}
export interface TranslationObject {
  [language: string]: Translation;
}
export const transformArrayToObject = (
  array: Translation[]
): TranslationObject => {
  return array.reduce((acc, item) => {
    acc[item.language] = item;
    return acc;
  }, {} as TranslationObject);
};

export const TRANSLATE_NS = 'ethora:translate';

export const normalizeTranslations = (value: unknown): Translation[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Translation =>
          !!item &&
          typeof item === 'object' &&
          typeof (item as any).translatedText === 'string' &&
          typeof (item as any).language === 'string' &&
          typeof (item as any).languageName === 'string'
      )
    : [];

export const parseTranslationsValue = (
  value: unknown
): TranslationObject | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  let payload: { translates?: unknown } = {};
  try {
    payload = JSON.parse(value) || {};
  } catch {
    payload = {};
  }
  return transformArrayToObject(normalizeTranslations(payload.translates));
};
