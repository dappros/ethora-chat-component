import { describe, it, expect } from 'vitest';
import { remarkLineBreaks, MarkdownAstNode } from './remarkLineBreaks';

// Exercises the tree walker directly against hand-built mdast fragments,
// so edge cases (code/html untouched, nested inline nodes, an
// all-newlines value) are pinned independently of react-markdown's own
// parsing. `MarkdownBody.linebreaks.test.tsx` covers the plugin wired
// into the real pipeline end to end.
const transform = (tree: MarkdownAstNode): MarkdownAstNode => {
  remarkLineBreaks()(tree);
  return tree;
};

const text = (value: string): MarkdownAstNode => ({ type: 'text', value });

describe('remarkLineBreaks', () => {
  it('splits a single soft break into text/break/text', () => {
    const tree: MarkdownAstNode = {
      type: 'paragraph',
      children: [text('line one\nline two')],
    };

    transform(tree);

    expect(tree.children).toEqual([
      { type: 'text', value: 'line one' },
      { type: 'break' },
      { type: 'text', value: 'line two' },
    ]);
  });

  it('splits multiple soft breaks in one text node', () => {
    const tree: MarkdownAstNode = {
      type: 'paragraph',
      children: [text('a\nb\nc')],
    };

    transform(tree);

    expect(tree.children?.map((n) => n.type)).toEqual([
      'text',
      'break',
      'text',
      'break',
      'text',
    ]);
    expect(tree.children?.map((n) => n.value)).toEqual([
      'a',
      undefined,
      'b',
      undefined,
      'c',
    ]);
  });

  it('leaves a text node without a newline untouched', () => {
    const tree: MarkdownAstNode = {
      type: 'paragraph',
      children: [text('no breaks here')],
    };

    transform(tree);

    expect(tree.children).toEqual([{ type: 'text', value: 'no breaks here' }]);
  });

  it('turns a text node that is only a newline into a single break, not a crash', () => {
    const tree: MarkdownAstNode = {
      type: 'paragraph',
      children: [text('\n')],
    };

    expect(() => transform(tree)).not.toThrow();
    expect(tree.children).toEqual([{ type: 'break' }]);
  });

  it('does not double up an existing hard-break node', () => {
    // What mdast actually looks like for "foo  \nbar" (trailing spaces) or
    // "foo\\\nbar" (backslash): the newline is already consumed into its
    // own `break` node by the parser, so neither text node contains a
    // literal "\n" for this plugin to find.
    const tree: MarkdownAstNode = {
      type: 'paragraph',
      children: [text('foo'), { type: 'break' }, text('bar')],
    };

    transform(tree);

    expect(tree.children).toEqual([
      { type: 'text', value: 'foo' },
      { type: 'break' },
      { type: 'text', value: 'bar' },
    ]);
  });

  it('descends into nested inline nodes (emphasis, strong, links)', () => {
    const tree: MarkdownAstNode = {
      type: 'paragraph',
      children: [
        {
          type: 'strong',
          children: [text('bold\ntext')],
        },
      ],
    };

    transform(tree);

    const strong = tree.children?.[0];
    expect(strong?.children).toEqual([
      { type: 'text', value: 'bold' },
      { type: 'break' },
      { type: 'text', value: 'text' },
    ]);
  });

  it('does not touch a code node value or descend into it', () => {
    const codeNode: MarkdownAstNode = { type: 'code', value: 'const a = 1;\nconst b = 2;' };
    const tree: MarkdownAstNode = {
      type: 'root',
      children: [codeNode],
    };

    transform(tree);

    expect(tree.children?.[0]).toBe(codeNode);
    expect(codeNode.value).toBe('const a = 1;\nconst b = 2;');
  });

  it('does not touch an inlineCode node value', () => {
    const inlineCodeNode: MarkdownAstNode = {
      type: 'inlineCode',
      value: 'a\nb',
    };
    const tree: MarkdownAstNode = {
      type: 'paragraph',
      children: [inlineCodeNode],
    };

    transform(tree);

    expect(tree.children?.[0]).toBe(inlineCodeNode);
    expect(inlineCodeNode.value).toBe('a\nb');
  });

  it('does not touch an html node value', () => {
    const htmlNode: MarkdownAstNode = { type: 'html', value: '<div>\nraw\n</div>' };
    const tree: MarkdownAstNode = {
      type: 'root',
      children: [htmlNode],
    };

    transform(tree);

    expect(tree.children?.[0]).toBe(htmlNode);
    expect(htmlNode.value).toBe('<div>\nraw\n</div>');
  });

  it('is a no-op on a tree with no children', () => {
    const tree: MarkdownAstNode = { type: 'root' };
    expect(() => transform(tree)).not.toThrow();
    expect(tree.children).toBeUndefined();
  });
});
