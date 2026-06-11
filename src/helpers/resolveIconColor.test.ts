import { describe, expect, it } from 'vitest';
import { resolveIconColor } from './resolveIconColor';

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
