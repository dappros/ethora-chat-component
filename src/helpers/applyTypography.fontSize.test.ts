import { afterEach, describe, expect, it } from 'vitest';
import { applyTypography, clearTypography } from './applyTypography';

const rootStyle = () => document.documentElement.style;

describe('applyTypography fontSize + family', () => {
  afterEach(() => {
    clearTypography();
  });

  it('publishes the base size and derived xs/sm/lg variables', () => {
    applyTypography({ fontSize: 18 });

    expect(rootStyle().getPropertyValue('--ethora-font-size')).toBe('18px');
    expect(rootStyle().getPropertyValue('--ethora-font-size-xs')).toBe('13.5px');
    expect(rootStyle().getPropertyValue('--ethora-font-size-sm')).toBe('15.75px');
    expect(rootStyle().getPropertyValue('--ethora-font-size-lg')).toBe('20.25px');
  });

  it('accepts a px string', () => {
    applyTypography({ fontSize: '20px' });
    expect(rootStyle().getPropertyValue('--ethora-font-size')).toBe('20px');
  });

  it('removes size variables when fontSize is omitted or invalid', () => {
    applyTypography({ fontSize: 18 });
    applyTypography({});
    expect(rootStyle().getPropertyValue('--ethora-font-size')).toBe('');

    applyTypography({ fontSize: 18 });
    applyTypography({ fontSize: 'not-a-size' });
    expect(rootStyle().getPropertyValue('--ethora-font-size')).toBe('');
  });

  it('derives --ethora-font-family from googleFontsFamily when fontFamily is absent', () => {
    // Root cause of "font does not apply to messages/sender": only
    // googleFontsFamily was passed, so the family var was never set.
    applyTypography({ googleFontsFamily: 'Inter' });
    expect(rootStyle().getPropertyValue('--ethora-font-family')).toContain(
      "'Inter'"
    );
  });

  it('prefers explicit fontFamily over googleFontsFamily', () => {
    applyTypography({ fontFamily: 'Roboto', googleFontsFamily: 'Inter' });
    expect(rootStyle().getPropertyValue('--ethora-font-family')).toContain(
      "'Roboto'"
    );
  });
});
