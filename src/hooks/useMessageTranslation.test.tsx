import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { useMessageTranslation } from './useMessageTranslation';

const Probe: React.FC<{
  message: any;
  readerLocale?: string;
  enabled?: boolean;
}> = ({ message, readerLocale, enabled = true }) => {
  const { hasTranslation, displayText } = useMessageTranslation(
    message,
    readerLocale,
    enabled
  );
  return <div data-testid="out">{`${hasTranslation}|${displayText}`}</div>;
};

const out = () => screen.getByTestId('out').textContent;

// Nothing here calls a network endpoint - every translation this hook can
// ever surface already arrived attached to the stanza (message.translations,
// see getDataFromXml). A message that was never translated server-side
// simply has none to show; that's absence of data, not a failed request.
describe('useMessageTranslation', () => {
  it('shows a translation already attached to the stanza', () => {
    render(
      <Probe
        message={{
          body: 'hola',
          langSource: 'es',
          translations: {
            en: { translatedText: 'hello', language: 'en', languageName: 'English' },
          },
        }}
        readerLocale="en"
      />
    );

    expect(out()).toBe('true|hello');
  });

  it('falls back to the original text when no translation is attached', () => {
    render(<Probe message={{ body: 'hola', langSource: 'es' }} readerLocale="en" />);

    expect(out()).toBe('false|hola');
  });

  it('shows nothing extra for a message already in the reader language', () => {
    render(<Probe message={{ body: 'hello', langSource: 'en' }} readerLocale="en" />);

    expect(out()).toBe('false|hello');
  });

  it('ignores region when deciding - en-US reader vs en-CA message is not a translation job', () => {
    render(
      <Probe message={{ body: 'hello', langSource: 'en-CA' }} readerLocale="en-US" />
    );

    expect(out()).toBe('false|hello');
  });

  it('shows nothing when disabled (manual mode owns its own click-to-reveal flow)', () => {
    render(
      <Probe
        message={{
          body: 'hola',
          langSource: 'es',
          translations: { en: { translatedText: 'hello', language: 'en', languageName: 'English' } },
        }}
        readerLocale="en"
        enabled={false}
      />
    );

    expect(out()).toBe('false|hola');
  });

  it('shows nothing when the source language is unknown - never tagged, so never translatable', () => {
    render(<Probe message={{ body: 'hola' }} readerLocale="en" />);

    expect(out()).toBe('false|hola');
  });

  // "Numbers don't need translating" - a phone number or order id has no
  // reader-language equivalent to show, tagged or not.
  it('shows nothing for a message that has no letters at all', () => {
    render(<Probe message={{ body: '42', langSource: 'es' }} readerLocale="en" />);

    expect(out()).toBe('false|42');
  });

  // Reported bug: a message rendered a small quote block and the body
  // showing the exact same sentence twice. Root cause: an attached
  // "translation" whose text happens to be byte-identical to the
  // original (mistagged langSource, a no-op echo, matching text that
  // coincidentally reads the same) still set hasTranslation - the UI has
  // no way to tell "real translation" from "same text twice" apart from
  // this hook, so the hook must make that call.
  it('treats an attached translation identical to the original as no translation at all', () => {
    render(
      <Probe
        message={{
          body: 'hello this is shapin',
          langSource: 'es',
          translations: {
            en: {
              translatedText: 'hello this is shapin',
              language: 'en',
              languageName: 'English',
            },
          },
        }}
        readerLocale="en"
      />
    );

    expect(out()).toBe('false|hello this is shapin');
  });

  it('ignores only leading/trailing whitespace differences when comparing - still no real translation', () => {
    render(
      <Probe
        message={{
          body: 'hola',
          langSource: 'es',
          translations: {
            en: { translatedText: '  hola  ', language: 'en', languageName: 'English' },
          },
        }}
        readerLocale="en"
      />
    );

    expect(out()).toBe('false|hola');
  });

  it('still resolves text that merely contains digits', () => {
    render(
      <Probe
        message={{
          body: 'sala 42',
          langSource: 'es',
          translations: { en: { translatedText: 'room 42', language: 'en', languageName: 'English' } },
        }}
        readerLocale="en"
      />
    );

    expect(out()).toBe('true|room 42');
  });
});
