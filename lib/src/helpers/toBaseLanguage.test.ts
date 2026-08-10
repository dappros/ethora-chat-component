import { describe, expect, it } from 'vitest';
import { toBaseLanguage } from './toBaseLanguage';

describe('toBaseLanguage', () => {
  it('strips the region from a full BCP-47 locale', () => {
    expect(toBaseLanguage('fr-CA')).toBe('fr');
    expect(toBaseLanguage('en-US')).toBe('en');
  });

  it('passes through a base-language-only code unchanged', () => {
    expect(toBaseLanguage('pt')).toBe('pt');
  });

  it('lowercases the result', () => {
    expect(toBaseLanguage('EN-us')).toBe('en');
  });

  it('returns an empty string for undefined/null/empty input', () => {
    expect(toBaseLanguage(undefined)).toBe('');
    expect(toBaseLanguage(null)).toBe('');
    expect(toBaseLanguage('')).toBe('');
  });
});
