import { describe, expect, it } from 'vitest';
import { deriveTranslateEndpoint } from './deriveTranslateEndpoint';

describe('deriveTranslateEndpoint', () => {
  it('turns the api.* host into translate.api.* with an explicit /translate path', () => {
    expect(deriveTranslateEndpoint('https://api.chat-qa.ethora.com/v1')).toBe(
      'https://translate.api.chat-qa.ethora.com/translate'
    );
  });

  it('ignores whatever API path is set (/v1, /v2, no path at all)', () => {
    expect(deriveTranslateEndpoint('https://api.chat.ethora.com/v2')).toBe(
      'https://translate.api.chat.ethora.com/translate'
    );
    expect(deriveTranslateEndpoint('https://api.chat.ethora.com')).toBe(
      'https://translate.api.chat.ethora.com/translate'
    );
  });

  it('preserves an explicit port', () => {
    expect(deriveTranslateEndpoint('http://api.localhost:4000/v1')).toBe(
      'http://translate.api.localhost:4000/translate'
    );
  });

  it('preserves the protocol', () => {
    expect(deriveTranslateEndpoint('http://api.chat.ethora.com/v1')).toBe(
      'http://translate.api.chat.ethora.com/translate'
    );
  });

  it('returns undefined for a missing baseUrl', () => {
    expect(deriveTranslateEndpoint(undefined)).toBeUndefined();
    expect(deriveTranslateEndpoint(null)).toBeUndefined();
    expect(deriveTranslateEndpoint('')).toBeUndefined();
  });

  it('returns undefined for a relative baseUrl (no origin to rewrite)', () => {
    expect(deriveTranslateEndpoint('/v1')).toBeUndefined();
    expect(deriveTranslateEndpoint('v1')).toBeUndefined();
  });

  it('returns undefined when the host is not in the api.* shape', () => {
    expect(deriveTranslateEndpoint('https://app.chat.ethora.com')).toBeUndefined();
    expect(deriveTranslateEndpoint('https://chat.ethora.com/v1')).toBeUndefined();
  });

  it('returns undefined for a non-http(s) protocol', () => {
    expect(deriveTranslateEndpoint('ftp://api.chat.ethora.com/v1')).toBeUndefined();
  });

  it('returns undefined for a malformed URL', () => {
    expect(deriveTranslateEndpoint('not a url')).toBeUndefined();
  });
});
