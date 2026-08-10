import { describe, expect, it } from 'vitest';
import { shouldShowLanguageSelector } from './ChatHeader';

// A host can hide the in-chat globe picker (config.translates.
// showLanguageSelector = false) when they drive the reader's language
// themselves via config.translates.readerLocale - see
// resolveExternalReaderLocaleLangSource in useChatWrapperInit.ts.
describe('shouldShowLanguageSelector', () => {
  it('shows the picker by default when translates is enabled', () => {
    expect(shouldShowLanguageSelector({ enabled: true })).toBe(true);
  });

  it('hides the picker when the host explicitly opts out', () => {
    expect(
      shouldShowLanguageSelector({ enabled: true, showLanguageSelector: false })
    ).toBe(false);
  });

  it('an explicit true is the same as the default', () => {
    expect(
      shouldShowLanguageSelector({ enabled: true, showLanguageSelector: true })
    ).toBe(true);
  });

  it('never shows the picker when translates itself is disabled, even if showLanguageSelector is true', () => {
    expect(
      shouldShowLanguageSelector({ enabled: false, showLanguageSelector: true })
    ).toBe(false);
  });

  it('does nothing when translates config is absent entirely', () => {
    expect(shouldShowLanguageSelector(undefined)).toBe(false);
  });
});
