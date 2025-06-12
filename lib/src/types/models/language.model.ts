export type Iso639_1Codes = 'en' | 'es' | 'pt' | 'ht' | 'zh';

export interface Language {
  iso639_1: Iso639_1Codes;
  name: string;
}

export type LanguageOptions = {
  languages: Array<Language>;
  language?: Iso639_1Codes;
};
