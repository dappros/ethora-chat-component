import { describe, expect, it } from 'vitest';
import { resolveMessageTranslationDisplay } from './resolveMessageTranslationDisplay';

describe('resolveMessageTranslationDisplay', () => {
  it('shows the translation + quote when the reader language differs from the sent language', () => {
    const result = resolveMessageTranslationDisplay(
      {
        body: 'hello',
        langSource: 'en',
        translations: { pt: { translatedText: 'olá', language: 'pt', languageName: 'Portuguese' } },
      } as any,
      'pt'
    );

    expect(result).toEqual({
      hasTranslation: true,
      originalText: 'hello',
      displayText: 'olá',
    });
  });

  it('does not show a translation/quote when the message was already sent in the reader language', () => {
    const result = resolveMessageTranslationDisplay(
      {
        body: 'olá',
        langSource: 'pt',
        translations: { pt: { translatedText: 'olá', language: 'pt', languageName: 'Portuguese' } },
      } as any,
      'pt'
    );

    expect(result).toEqual({
      hasTranslation: false,
      originalText: 'olá',
      displayText: 'olá',
    });
  });

  it('ignores region when comparing (fr-CA sender vs fr-FR reader = same base language)', () => {
    const result = resolveMessageTranslationDisplay(
      {
        body: 'bonjour',
        langSource: 'fr-CA',
        translations: { 'fr-FR': { translatedText: 'bonjour (fr-FR)', language: 'fr-FR', languageName: 'French' } },
      } as any,
      'fr-FR'
    );

    expect(result.hasTranslation).toBe(false);
    expect(result.displayText).toBe('bonjour');
  });

  it('falls back to the base-language translation key when the full locale is not present', () => {
    const result = resolveMessageTranslationDisplay(
      {
        body: 'hello',
        langSource: 'en',
        translations: { fr: { translatedText: 'bonjour', language: 'fr', languageName: 'French' } },
      } as any,
      'fr-CA'
    );

    expect(result).toEqual({
      hasTranslation: true,
      originalText: 'hello',
      displayText: 'bonjour',
    });
  });

  it('does not show a translation when there is no matching translated text at all', () => {
    const result = resolveMessageTranslationDisplay(
      { body: 'hello', langSource: 'en', translations: {} } as any,
      'pt'
    );

    expect(result).toEqual({
      hasTranslation: false,
      originalText: 'hello',
      displayText: 'hello',
    });
  });

  it('does not show a translation when the message has no recorded source language', () => {
    const result = resolveMessageTranslationDisplay(
      {
        body: 'hello',
        langSource: undefined,
        translations: { pt: { translatedText: 'olá', language: 'pt', languageName: 'Portuguese' } },
      } as any,
      'pt'
    );

    expect(result.hasTranslation).toBe(false);
  });

  it('defaults the reader locale to English when none is given', () => {
    const result = resolveMessageTranslationDisplay(
      {
        body: 'olá',
        langSource: 'pt',
        translations: { en: { translatedText: 'hello', language: 'en', languageName: 'English' } },
      } as any
    );

    expect(result).toEqual({
      hasTranslation: true,
      originalText: 'olá',
      displayText: 'hello',
    });
  });
});
