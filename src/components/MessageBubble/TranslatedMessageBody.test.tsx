import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  props: Partial<React.ComponentProps<typeof TranslatedMessageBody>> = {}
) =>
  render(
    <TranslatedMessageBody
      originalText="bad boy bad boys what you gonna do"
      accentColor="#5E3FDE"
      {...props}
    >
      {markdownBody('menino travesso meninos travessos o que você vai fazer')}
    </TranslatedMessageBody>
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

  it('renders a multi-paragraph translation intact', () => {
    render(
      <TranslatedMessageBody originalText="original">
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
