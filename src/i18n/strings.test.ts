import { describe, expect, it } from 'vitest';
import {
  BUILTIN_STRINGS,
  DEFAULT_UI_LANGUAGE,
  interpolate,
  resolveStringTable,
  toBaseLanguage,
  translateKey,
} from './strings';
import { LANGUAGE_OPTIONS } from '../helpers/constants/LANGUAGE_OPTIONS';

// The completeness check below compares the tables that EXIST against each
// other - by construction it cannot see a language that has no table at
// all. That blind spot shipped: the picker offered pt/ht/zh while
// BUILTIN_STRINGS only had en/fr/es, so choosing Portuguese translated the
// messages and left every button in English, silently (resolveStringTable
// falls back to English for an unknown language - correct behaviour, but
// it means nothing ever errors).
//
// This is the check that ties the two lists together: if the picker offers
// it, it must be translated.
describe('every language the picker offers is actually translated', () => {
  it.each(LANGUAGE_OPTIONS.map((o) => [o.name, o.id] as const))(
    '%s (%s) has a built-in string table',
    (_name, id) => {
      expect(Object.keys(BUILTIN_STRINGS)).toContain(id);
    }
  );
});

// Guards against exactly what already happened once with the
// translation.* keys mid-session: a key added to `en` but forgotten in the
// other tables. resolveStringTable() silently falls back to English for a
// missing key, so an incomplete table never breaks anything visibly -
// it just quietly ships an English string inside an otherwise-translated
// UI. Only a completeness check catches that.
describe('BUILTIN_STRINGS completeness', () => {
  const languages = Object.keys(BUILTIN_STRINGS);
  const englishKeys = Object.keys(BUILTIN_STRINGS[DEFAULT_UI_LANGUAGE]);

  it('has more than one built-in language', () => {
    expect(languages.length).toBeGreaterThan(1);
  });

  it.each(languages.filter((lang) => lang !== DEFAULT_UI_LANGUAGE))(
    '%s has every key that en has',
    (lang) => {
      const table = BUILTIN_STRINGS[lang];
      const missing = englishKeys.filter((key) => !(key in table));
      expect(missing).toEqual([]);
    }
  );

  it.each(languages)('%s has no empty string values', (lang) => {
    const table = BUILTIN_STRINGS[lang];
    const empty = Object.entries(table)
      .filter(([, value]) => !value || !value.trim())
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });

  // Every `{placeholder}` in the English source must exist (by name) in
  // every translation - a translator renaming or dropping a placeholder
  // would silently leave the literal "{count}" in the rendered UI instead
  // of the interpolated value.
  it.each(languages.filter((lang) => lang !== DEFAULT_UI_LANGUAGE))(
    '%s keeps the same {placeholders} as en for every key',
    (lang) => {
      const table = BUILTIN_STRINGS[lang];
      const placeholdersOf = (s: string) =>
        [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

      const mismatches = englishKeys
        .filter((key) => key in table)
        .filter((key) => {
          const enPlaceholders = placeholdersOf(BUILTIN_STRINGS[DEFAULT_UI_LANGUAGE][key]);
          const otherPlaceholders = placeholdersOf(table[key]);
          return JSON.stringify(enPlaceholders) !== JSON.stringify(otherPlaceholders);
        });
      expect(mismatches).toEqual([]);
    }
  );
});

describe('toBaseLanguage', () => {
  it('reduces a full locale to its base language', () => {
    expect(toBaseLanguage('fr-CA')).toBe('fr');
    expect(toBaseLanguage('EN-us')).toBe('en');
  });

  it('falls back to the default language for empty/missing input', () => {
    expect(toBaseLanguage(undefined)).toBe(DEFAULT_UI_LANGUAGE);
    expect(toBaseLanguage('')).toBe(DEFAULT_UI_LANGUAGE);
  });
});

describe('resolveStringTable', () => {
  it('resolves a built-in language', () => {
    const table = resolveStringTable('es');
    expect(table['action.send']).toBe('Enviar');
  });

  it('falls back to English for an unknown language', () => {
    const table = resolveStringTable('xx');
    expect(table['action.send']).toBe('Send');
  });

  it('lets host overrides win over the built-in table', () => {
    const table = resolveStringTable('en', { 'action.send': 'Go' });
    expect(table['action.send']).toBe('Go');
  });

  it('merges a host override on top of a non-English table without dropping the rest', () => {
    const table = resolveStringTable('es', { 'action.send': 'Custom' });
    expect(table['action.send']).toBe('Custom');
    expect(table['action.cancel']).toBe('Cancelar');
  });
});

describe('interpolate', () => {
  it('substitutes named placeholders', () => {
    expect(interpolate('{count} online', { count: 3 })).toBe('3 online');
  });

  it('leaves an unmatched placeholder untouched', () => {
    expect(interpolate('{count} online', {})).toBe('{count} online');
  });

  it('returns the template unchanged when no vars are given', () => {
    expect(interpolate('Send')).toBe('Send');
  });
});

describe('translateKey', () => {
  it('resolves and interpolates in one call', () => {
    expect(translateKey('presence.onlineCount', 'es', null, { count: 5 })).toBe(
      '5 en línea'
    );
  });

  it('falls back to the raw key when it does not exist in any table', () => {
    expect(translateKey('not.a.real.key', 'en')).toBe('not.a.real.key');
  });
});
