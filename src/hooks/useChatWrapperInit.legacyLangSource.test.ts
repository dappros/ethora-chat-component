import { describe, expect, it } from 'vitest';
import {
  resolveLegacyTranslatesLangSource,
  resolveExternalReaderLocaleLangSource,
} from './useChatWrapperInit';

// Regression coverage for a real bug: this used to be gated on
// `!config?.translates?.translations` (the ABSENCE of the legacy field),
// then dispatched that same absent value - i.e. it called
// setLangSource(undefined) on every XMPP init merely because
// `translates.enabled` was true, wiping out whatever language the reader
// had actually picked (profile modal picker, or a host's own
// readerLocale-driven dispatch) right after they set it. "Enabling
// translates" therefore silently broke itself a moment later.
describe('resolveLegacyTranslatesLangSource', () => {
  it('returns the legacy locale when translates is enabled and a locale is set', () => {
    expect(
      resolveLegacyTranslatesLangSource({ enabled: true, translations: 'pt' })
    ).toBe('pt');
  });

  it('does NOT return undefined-clobbering when no legacy locale is configured', () => {
    expect(
      resolveLegacyTranslatesLangSource({ enabled: true })
    ).toBeUndefined();
  });

  it('does nothing when translates is disabled, even if a legacy locale is set', () => {
    expect(
      resolveLegacyTranslatesLangSource({ enabled: false, translations: 'pt' })
    ).toBeUndefined();
  });

  it('does nothing when translates config is absent entirely', () => {
    expect(resolveLegacyTranslatesLangSource(undefined)).toBeUndefined();
  });
});

// A host driving the reader's language from OUTSIDE the chat component
// (config.translates.readerLocale) - the effect built on this resolver must
// only ever dispatch when the host actually set something, so a host that
// leaves readerLocale unset never clobbers the reader's own in-chat pick.
describe('resolveExternalReaderLocaleLangSource', () => {
  it('resolves a host-provided readerLocale to its base language', () => {
    expect(resolveExternalReaderLocaleLangSource('fr-CA')).toBe('fr');
  });

  it('passes through a base-language-only locale unchanged', () => {
    expect(resolveExternalReaderLocaleLangSource('pt')).toBe('pt');
  });

  it('does nothing when the host has not set readerLocale', () => {
    expect(resolveExternalReaderLocaleLangSource(undefined)).toBeUndefined();
  });

  it('does nothing for an empty string', () => {
    expect(resolveExternalReaderLocaleLangSource('')).toBeUndefined();
  });
});
