import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { parseMessageBody } from './parseMessageBody';

describe('parseMessageBody - mention highlighting', () => {
  it('wraps the exact mention range in a highlighted span', () => {
    const { container } = render(
      <>
        {parseMessageBody({
          text: 'hi @Bob Smith how are you',
          mentions: [
            { begin: 3, end: 13, uri: '', xmppUsername: 'bob' },
          ],
        })}
      </>
    );

    const spans = Array.from(container.querySelectorAll('span')).filter(
      (el) => el.textContent === '@Bob Smith'
    );
    expect(spans).toHaveLength(1);
  });

  it('renders plain text (no highlight span) when there are no mentions', () => {
    const { container } = render(
      <>{parseMessageBody({ text: 'just a normal message' })}</>
    );

    const spans = container.querySelectorAll('span');
    expect(spans).toHaveLength(0);
  });

  it('styles a self-mention distinctly from a mention of someone else', () => {
    const { container: selfContainer } = render(
      <>
        {parseMessageBody({
          text: '@Me hi',
          mentions: [{ begin: 0, end: 3, uri: '', xmppUsername: 'me' }],
          currentXmppUsername: 'me',
        })}
      </>
    );
    const { container: otherContainer } = render(
      <>
        {parseMessageBody({
          text: '@Bob hi',
          mentions: [{ begin: 0, end: 4, uri: '', xmppUsername: 'bob' }],
          currentXmppUsername: 'me',
        })}
      </>
    );

    const selfSpan = selfContainer.querySelector('span');
    const otherSpan = otherContainer.querySelector('span');
    expect(selfSpan?.style.backgroundColor).not.toBe(
      otherSpan?.style.backgroundColor
    );
  });

  it('skips an out-of-range mention instead of throwing', () => {
    expect(() =>
      render(
        <>
          {parseMessageBody({
            text: 'short',
            mentions: [{ begin: 0, end: 100, uri: '', xmppUsername: 'bob' }],
          })}
        </>
      )
    ).not.toThrow();
  });
});
