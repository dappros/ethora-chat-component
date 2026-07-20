// Regional variants for the three languages LANGUAGE_OPTIONS currently
// offers, matching the deployment's actual reader regions - Canadian
// English/French, US Spanish. Bare 2-letter codes stay valid alongside
// them (toBaseLanguage reduces either form to the same base for i18n
// string-table lookups and translation-language comparisons), since other
// flows (config.translates.translations, resolveExternalReaderLocaleLangSource)
// still produce or accept the bare form.
export type Iso639_1Codes =
  | 'en'
  | 'en-CA'
  | 'es'
  | 'es-US'
  | 'pt'
  | 'ht'
  | 'fr'
  | 'fr-CA'
  | 'zh';

export interface Language {
  iso639_1: Iso639_1Codes;
  name: string;
}

export type LanguageOptions = {
  languages: Array<Language>;
  language?: Iso639_1Codes;
};
