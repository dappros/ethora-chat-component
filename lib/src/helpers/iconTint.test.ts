import { afterEach, describe, expect, it } from 'vitest';
import { applyThemeColors } from './resolveIconColor';

const tint = () => document.getElementById('ethora-icon-tint');

describe('applyThemeColors icon tint (host-CSS-proof)', () => {
  afterEach(() => {
    applyThemeColors(null);
  });

  it('injects an !important rule with the resolved icon colour', () => {
    applyThemeColors({ colors: { primary: '#5E3FDE', secondary: '#fff' } });
    const css = tint()?.textContent || '';
    expect(css).toContain('#5E3FDE !important');
    expect(css).toContain('[fill^="var(--ethora-icon-color"]');
    expect(css).toContain('[stroke^="var(--ethora-icon-color"]');
  });

  it('prefers colors.icons over primary', () => {
    applyThemeColors({
      colors: { primary: '#111', secondary: '#fff', icons: '#FF6600' },
    });
    expect(tint()?.textContent || '').toContain('#FF6600 !important');
  });

  it('removes the rule entirely when no icon colour is configured', () => {
    applyThemeColors({ colors: { primary: '#5E3FDE', secondary: '#fff' } });
    expect(tint()).not.toBeNull();
    applyThemeColors({});
    expect(tint()).toBeNull();
  });
});
