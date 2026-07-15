import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import TranslatedMessageBody from './TranslatedMessageBody';

// Mirrors what parseMessageBody actually emits: paragraphs nested inside
// its own wrapper div, each carrying ReactMarkdown's `margin: 12px 0`.
const markdownBody = (...paragraphs: string[]) => (
  <div className="message-body">
    <div>
      {paragraphs.map((text) => (
        <p key={text} style={{ margin: '12px 0' }}>
          {text}
        </p>
      ))}
    </div>
  </div>
);

const renderBlock = (
  props: Partial<React.ComponentProps<typeof TranslatedMessageBody>> = {},
  uiLocale = 'en'
) =>
  renderWithProviders(
    <TranslatedMessageBody
      originalText="bad boy bad boys what you gonna do"
      sourceLanguage="en"
      accentColor="#5E3FDE"
      {...props}
    >
      {markdownBody('menino travesso meninos travessos o que você vai fazer')}
    </TranslatedMessageBody>,
    { preloadedState: { chatSettingStore: { config: { i18n: { locale: uiLocale } } } as any } }
  );

describe('TranslatedMessageBody', () => {
  it('shows the original and the translation together', () => {
    renderBlock();

    expect(screen.getByText('bad boy bad boys what you gonna do')).toBeTruthy();
    expect(
      screen.getByText('menino travesso meninos travessos o que você vai fazer')
    ).toBeTruthy();
  });

  // The reported bug: the quote bar was a literal "|" typed into the text,
  // which rendered as a stray glyph next to the original.
  it('draws the quote bar with a real border, not a literal "|" character', () => {
    const { container } = renderBlock();

    expect(container.textContent).not.toContain('|');

    const quote = screen.getByText('bad boy bad boys what you gonna do');
    expect(getComputedStyle(quote).borderLeftStyle).toBe('solid');
    expect(getComputedStyle(quote).borderLeftWidth).toBe('2px');
  });

  it('tints the quote bar with the app accent colour', () => {
    renderBlock({ accentColor: '#5E3FDE' });

    const quote = screen.getByText('bad boy bad boys what you gonna do');
    // jsdom normalises hex to rgb.
    expect(getComputedStyle(quote).borderLeftColor).toBe('rgb(94, 63, 222)');
  });

  it('names the source language in English for an English UI', () => {
    renderBlock({ sourceLanguage: 'pt' }, 'en');

    expect(screen.getByText('Translated from Portuguese')).toBeTruthy();
  });

  // A half-translated label ("Traduit de Portuguese") is the bug this
  // guards: the phrase and the language name inside it must resolve in
  // the SAME locale.
  it('localizes the whole label - phrase and language name together', () => {
    renderBlock({ sourceLanguage: 'pt' }, 'fr');

    expect(screen.getByText('Traduit de portugais')).toBeTruthy();
  });

  it('resolves a full locale down to its language name', () => {
    renderBlock({ sourceLanguage: 'en-CA' }, 'en');

    expect(screen.getByText('Translated from English')).toBeTruthy();
  });

  it('degrades to a plain "Translated" label rather than showing a raw code', () => {
    renderBlock({ sourceLanguage: 'not-a-language' }, 'en');

    expect(screen.getByText('Translated')).toBeTruthy();
    expect(screen.queryByText(/not-a-language/)).toBeNull();
  });

  it('falls back to a bare "Translated" when the source language is unknown', () => {
    renderBlock({ sourceLanguage: undefined });

    expect(screen.getByText('Translated')).toBeTruthy();
  });

  it('falls back in the UI language, not English', () => {
    renderBlock({ sourceLanguage: undefined }, 'fr');

    expect(screen.getByText('Traduit')).toBeTruthy();
  });

  it('renders a multi-paragraph translation intact', () => {
    renderWithProviders(
      <TranslatedMessageBody originalText="original" sourceLanguage="en">
        {markdownBody('first para', 'middle para', 'last para')}
      </TranslatedMessageBody>
    );

    expect(screen.getByText('first para')).toBeTruthy();
    expect(screen.getByText('middle para')).toBeTruthy();
    expect(screen.getByText('last para')).toBeTruthy();
  });

  // NOT tested here: that TranslatedText collapses markdown's inline
  // `p { margin: 12px 0 }` (the other half of the reported gap). It relies
  // on an author `!important` rule beating an inline style - real cascade
  // behaviour that jsdom's getComputedStyle does not model: jsdom applies
  // inline styles last regardless of !important, so an assertion here
  // would fail against correct code. Verified in a real browser instead:
  // first p margin-top 0, last p margin-bottom 0, middle p keeps 12px.
});
