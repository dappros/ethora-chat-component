import { describe, expect, it } from 'vitest';
import { resolveIconBgColor, resolveIconColor } from './resolveIconColor';

describe('resolveIconColor', () => {
  it('prefers colors.icons over primary', () => {
    expect(
      resolveIconColor({ colors: { primary: '#111', secondary: '#222', icons: '#abc' } })
    ).toBe('#abc');
  });

  it('falls back to colors.primary', () => {
    expect(
      resolveIconColor({ colors: { primary: '#5E3FDE', secondary: '#222' } })
    ).toBe('#5E3FDE');
  });

  it('falls back to the default when no colors set', () => {
    expect(resolveIconColor(undefined)).toBe('#0052CD');
    expect(resolveIconColor({})).toBe('#0052CD');
  });
});

describe('resolveIconBgColor', () => {
  it('prefers colors.iconsBg over secondary', () => {
    expect(
      resolveIconBgColor({
        colors: { primary: '#111', secondary: '#222', iconsBg: '#abc' },
      })
    ).toBe('#abc');
  });

  it('does NOT fall back to colors.secondary (avoids black icon chips)', () => {
    expect(
      resolveIconBgColor({ colors: { primary: '#111', secondary: '#222' } })
    ).toBe('#F0F3F7');
  });

  it('falls back to the soft neutral default when no iconsBg set', () => {
    expect(resolveIconBgColor(undefined)).toBe('#F0F3F7');
    expect(resolveIconBgColor({})).toBe('#F0F3F7');
  });
});
