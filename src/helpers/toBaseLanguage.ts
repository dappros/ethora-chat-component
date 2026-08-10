import { Iso639_1Codes } from '../types/models/language.model';

/**
 * "fr-CA" -> "fr", "EN" -> "en". Region only matters for the translation
 * service's dialect handling - everywhere else (matching a source language
 * against a reader's, caching, `langSource`) only the base language is
 * meaningful.
 */
export const toBaseLanguage = (locale?: string | null): Iso639_1Codes =>
  String(locale || '').split('-')[0].toLowerCase() as Iso639_1Codes;
