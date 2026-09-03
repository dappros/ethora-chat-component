import { describe, expect, it } from 'vitest';
import { buildThemeTokens, shadeColor, tintColor } from './tokens';

describe('buildThemeTokens', () => {
  it('returns the default token map when no config is passed', () => {
    const tokens = buildThemeTokens();

    expect(tokens['--ethora-color-primary']).toBe('#0052CD');
    expect(tokens['--ethora-color-primary-soft']).toBe('#E7EDF9');
    expect(tokens['--ethora-color-text']).toBe('#141414');
    expect(tokens['--ethora-radius-md']).toBe('12px');
    expect(tokens['--ethora-space-4']).toBe('16px');
    expect(tokens['--ethora-motion-fast']).toBe('150ms');
    expect(tokens['--ethora-motion-ease']).toBe('cubic-bezier(.2,.8,.2,1)');
  });

  it('derives primary-hover and primary-soft from an overridden primary color', () => {
    const tokens = buildThemeTokens({ primary: '#123456', secondary: '#000' });

    expect(tokens['--ethora-color-primary']).toBe('#123456');
    // Hover is a shade (darker) of primary, distinct from primary itself.
    expect(tokens['--ethora-color-primary-hover']).not.toBe('#123456');
    expect(tokens['--ethora-color-primary-hover']).toBe(shadeColor('#123456', 0.08));
    // Soft tint (lighter) derived from primary when ownMessageBackground unset.
    expect(tokens['--ethora-color-primary-soft']).toBe(tintColor('#123456', 0.88));
  });

  it('prefers ownMessageBackground for the soft primary tint when provided', () => {
    const tokens = buildThemeTokens({
      primary: '#0052CD',
      secondary: '#000',
      ownMessageBackground: '#FFEECC',
    });

    expect(tokens['--ethora-color-primary-soft']).toBe('#FFEECC');
  });

  it('resolves icons/iconsBg with the documented fallback chain', () => {
    const withoutOverrides = buildThemeTokens({
      primary: '#0052CD',
      secondary: '#333333',
    });
    expect(withoutOverrides['--ethora-color-icons']).toBe('#0052CD');
    expect(withoutOverrides['--ethora-color-icons-bg']).toBe('#333333');

    const withOverrides = buildThemeTokens({
      primary: '#0052CD',
      secondary: '#333333',
      icons: '#ABCDEF',
      iconsBg: '#111111',
    });
    expect(withOverrides['--ethora-color-icons']).toBe('#ABCDEF');
    expect(withOverrides['--ethora-color-icons-bg']).toBe('#111111');
  });

  it('falls back to default weights and applies typography.weights overrides', () => {
    const defaults = buildThemeTokens();
    expect(defaults['--ethora-font-weight-semibold']).toBe('600');

    const overridden = buildThemeTokens(undefined, {
      weights: { semibold: 650 },
    });
    expect(overridden['--ethora-font-weight-semibold']).toBe('650');
    expect(overridden['--ethora-font-weight-regular']).toBe('400');
  });

  it('ignores an invalid primary hex and falls back to the default', () => {
    const tokens = buildThemeTokens({ primary: 'not-a-color', secondary: '#000' });
    expect(tokens['--ethora-color-primary']).toBe('#0052CD');
  });
});

describe('tintColor / shadeColor', () => {
  it('tints toward white', () => {
    expect(tintColor('#000000', 0.5)).toBe('#808080');
    expect(tintColor('#000000', 1)).toBe('#ffffff');
    expect(tintColor('#000000', 0)).toBe('#000000');
  });

  it('shades toward black', () => {
    expect(shadeColor('#ffffff', 0.5)).toBe('#808080');
    expect(shadeColor('#ffffff', 1)).toBe('#000000');
    expect(shadeColor('#ffffff', 0)).toBe('#ffffff');
  });

  it('passes through invalid hex input unchanged', () => {
    expect(tintColor('not-a-color', 0.5)).toBe('not-a-color');
    expect(shadeColor('not-a-color', 0.5)).toBe('not-a-color');
  });
});
