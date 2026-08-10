import { describe, expect, it } from 'vitest';
import { shouldTagOutgoingTranslateSource } from './useSendMessage';

// The gate deciding whether an outgoing message gets
// `<translate source="xx"/>` attached - two independent layers (host
// feature flag, reader runtime toggle) collapsed into one predicate so it
// can be tested without mounting the whole send hook / XMPP client.
describe('shouldTagOutgoingTranslateSource', () => {
  it('tags when the host enabled it and the reader never touched the toggle', () => {
    // undefined = reader never opened the language selector - must read
    // as opted-in, or every existing host silently stops tagging sends
    // the moment this feature ships.
    expect(shouldTagOutgoingTranslateSource(true, undefined)).toBe(true);
  });

  it('tags when the host enabled it and the reader explicitly opted in', () => {
    expect(shouldTagOutgoingTranslateSource(true, true)).toBe(true);
  });

  it('does not tag when the reader explicitly opted out, even if the host enabled it', () => {
    expect(shouldTagOutgoingTranslateSource(true, false)).toBe(false);
  });

  it('never tags when the host has not enabled the feature, regardless of the reader toggle', () => {
    expect(shouldTagOutgoingTranslateSource(false, true)).toBe(false);
    expect(shouldTagOutgoingTranslateSource(undefined, true)).toBe(false);
  });
});
