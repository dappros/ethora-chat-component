import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildThemeTokens, useResolvedColorScheme } from './tokens';

describe('buildThemeTokens colour scheme', () => {
  it('light is the default and matches the explicit light scheme', () => {
    expect(buildThemeTokens()).toEqual(buildThemeTokens(undefined, undefined, 'light'));
  });

  it('light keeps the historical surface literals', () => {
    const tokens = buildThemeTokens(undefined, undefined, 'light');
    expect(tokens['--ethora-color-bg']).toBe('#FFFFFF');
    expect(tokens['--ethora-color-chat-bg']).toBe('#F3F6FC');
    expect(tokens['--ethora-color-overlay']).toBe('rgba(0, 0, 0, 0.5)');
    // primary-text is a pure alias of primary in light.
    expect(tokens['--ethora-color-primary-text']).toBe(tokens['--ethora-color-primary']);
  });

  it('dark swaps the neutrals and lifts brand text', () => {
    const light = buildThemeTokens(undefined, undefined, 'light');
    const dark = buildThemeTokens(undefined, undefined, 'dark');
    for (const name of [
      '--ethora-color-bg',
      '--ethora-color-bg-subtle',
      '--ethora-color-text',
      '--ethora-color-border',
      '--ethora-color-chat-bg',
      '--ethora-color-primary-soft',
    ]) {
      expect(dark[name], name).not.toBe(light[name]);
    }
    expect(dark['--ethora-color-bg']).toBe('#1A1C21');
    expect(dark['--ethora-color-primary-text']).not.toBe(dark['--ethora-color-primary']);
    // Text on primary fills stays white.
    expect(dark['--ethora-color-text-on-primary']).toBe('#FFFFFF');
  });

  // `secondary` is a light-page colour by nature (the SDK's own default
  // config ships #F3F6FC), so inheriting it in dark painted a near-white
  // chip on a dark surface.
  it('dark does not fall back to a host secondary for the icon chip', () => {
    const colors = { primary: '#0052CD', secondary: '#F3F6FC' } as any;
    expect(buildThemeTokens(colors, undefined, 'light')['--ethora-color-icons-bg']).toBe(
      '#F3F6FC'
    );
    expect(buildThemeTokens(colors, undefined, 'dark')['--ethora-color-icons-bg']).toBe(
      '#24272D'
    );
  });

  it('dark still honours host icon colours as given', () => {
    const dark = buildThemeTokens(
      { primary: '#123456', secondary: '#000', icons: '#FF00FF', iconsBg: '#00FF00' },
      undefined,
      'dark'
    );
    expect(dark['--ethora-color-icons']).toBe('#FF00FF');
    expect(dark['--ethora-color-icons-bg']).toBe('#00FF00');
  });
});

describe('useResolvedColorScheme', () => {
  let listeners: Array<() => void> = [];
  let prefersDark = false;

  const mockMatchMedia = () => {
    listeners = [];
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        get matches() {
          return prefersDark;
        },
        addEventListener: (_: string, cb: () => void) => listeners.push(cb),
        removeEventListener: (_: string, cb: () => void) => {
          listeners = listeners.filter((l) => l !== cb);
        },
      }))
    );
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    prefersDark = false;
  });

  it('defaults to light and ignores the OS when not set to system', () => {
    prefersDark = true;
    mockMatchMedia();
    expect(renderHook(() => useResolvedColorScheme()).result.current).toBe('light');
    expect(renderHook(() => useResolvedColorScheme('light')).result.current).toBe('light');
    expect(renderHook(() => useResolvedColorScheme('dark')).result.current).toBe('dark');
  });

  it('system follows the OS and updates live', () => {
    prefersDark = false;
    mockMatchMedia();
    const { result } = renderHook(() => useResolvedColorScheme('system'));
    expect(result.current).toBe('light');
    act(() => {
      prefersDark = true;
      listeners.forEach((l) => l());
    });
    expect(result.current).toBe('dark');
  });
});
