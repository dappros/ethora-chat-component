/**
 * A message typed with real line breaks (a single "\n" per line) used to
 * render as one line: CommonMark treats a lone "\n" as a soft break, which
 * every markdown renderer (react-markdown included) turns into a plain
 * space. `remarkLineBreaks.ts` fixes that by rewriting soft breaks into
 * real `break` nodes before react-markdown renders them.
 *
 * These tests exercise the fix through the real pipeline (MarkdownBody,
 * same as `MarkdownBody.sanitize.test.tsx`). `remarkLineBreaks.test.ts`
 * covers the tree-walking logic itself in isolation.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import MarkdownBody from './MarkdownBody';

const renderBody = (text: string) => render(<MarkdownBody text={text} />);

// mdast-util-to-hast's own `break` handler emits the <br> element followed
// by a cosmetic text node containing "\n" (purely for nicer raw HTML
// output - the same thing happens for a pre-existing hard break, e.g. two
// trailing spaces). It sits right after the <br>, so browsers collapse it
// away like any other whitespace at a line start and it is never actually
// visible. Strip it before comparing rendered text so assertions reflect
// what a reader actually sees rather than this DOM-serialisation detail.
const visibleText = (el: Element | null) =>
  (el?.textContent ?? '').replace(/\n/g, '');

describe('MarkdownBody line breaks', () => {
  it('renders a single newline as a real line break, not a collapsed space', () => {
    const { container } = renderBody('line one\nline two');

    // A single <p> (no blank line, so no new paragraph) containing a <br>
    // between the two lines.
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].querySelectorAll('br')).toHaveLength(1);
    expect(visibleText(paragraphs[0])).toBe('line oneline two');
    expect(container.textContent).not.toContain('line one line two');
  });

  it('renders the reported bug case: a list under a line of text, one newline apart', () => {
    const { container } = renderBody(
      [
        'Чоловік приходить до лікаря:',
        '- Докторе, мене всі ігнорують.',
        '- Наступний!',
      ].join('\n')
    );

    // The intro line and the two list items must not be joined into one
    // space-separated line.
    expect(container.textContent).not.toContain(
      'Чоловік приходить до лікаря: Докторе'
    );
    expect(screen.getByText('Чоловік приходить до лікаря:')).toBeInTheDocument();
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('Докторе, мене всі ігнорують.');
    expect(items[1].textContent).toBe('Наступний!');
  });

  it('keeps a blank-line paragraph break as two separate paragraphs, not extra gaps', () => {
    const { container } = renderBody(['first paragraph', '', 'second paragraph'].join('\n'));

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe('first paragraph');
    expect(paragraphs[1].textContent).toBe('second paragraph');
    // No stray <br> from turning the blank line itself into a break - the
    // paragraph split already comes from CommonMark's block parsing.
    expect(container.querySelectorAll('br')).toHaveLength(0);
  });

  it('keeps a multi-line paragraph followed by a blank-line paragraph correct', () => {
    const { container } = renderBody(
      ['line one', 'line two', '', 'second paragraph'].join('\n')
    );

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].querySelectorAll('br')).toHaveLength(1);
    expect(visibleText(paragraphs[0])).toBe('line oneline two');
    expect(paragraphs[1].textContent).toBe('second paragraph');
  });

  it('does not double an existing hard break made with two trailing spaces', () => {
    const { container } = renderBody('foo  \nbar');

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].querySelectorAll('br')).toHaveLength(1);
    expect(visibleText(paragraphs[0])).toBe('foobar');
  });

  it('does not double an existing hard break made with a trailing backslash', () => {
    const { container } = renderBody('foo\\\nbar');

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].querySelectorAll('br')).toHaveLength(1);
    expect(visibleText(paragraphs[0])).toBe('foobar');
  });

  it('keeps a fenced code block verbatim, including its internal newlines', () => {
    const { container } = renderBody('```\nconst a = 1;\nconst b = 2;\n```');

    const code = container.querySelector('pre code');
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe('const a = 1;\nconst b = 2;\n');
    expect(code?.querySelector('br')).toBeNull();
  });

  it('keeps inline code verbatim when it sits next to a real line break', () => {
    const { container } = renderBody('run `npm run build`\nthen deploy');

    const inlineCode = container.querySelector('p code');
    expect(inlineCode?.textContent).toBe('npm run build');
    const paragraph = container.querySelector('p');
    expect(paragraph?.querySelectorAll('br')).toHaveLength(1);
  });

  it('leaves raw HTML passthrough untouched', () => {
    const { container } = renderBody('one\ntwo <b>bold\ntext</b> three');

    // The <b> element survives (existing rehype-raw behaviour), and the
    // soft break just before it still becomes a real line break.
    expect(container.querySelector('b')?.textContent).toBe('bold\ntext');
    expect(container.querySelectorAll('br').length).toBeGreaterThanOrEqual(1);
  });

  it('still renders a tight list as a list', () => {
    const { container } = renderBody(['- one', '- two', '- three'].join('\n'));

    const items = container.querySelectorAll('ul li');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toBe('one');
    expect(items[2].textContent).toBe('three');
    // List items are their own blocks, not soft-broken text - no <br>
    // leaks in from turning the item separators into breaks.
    expect(container.querySelectorAll('ul br')).toHaveLength(0);
  });

  it('does not crash on a body that is only newlines', () => {
    expect(() => renderBody('\n\n\n')).not.toThrow();
  });

  it('does not crash on a single newline with nothing else', () => {
    expect(() => renderBody('\n')).not.toThrow();
  });
});
