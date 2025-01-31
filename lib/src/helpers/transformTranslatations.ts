interface Translation {
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
