/**
 * A tiny local stand-in for `remark-breaks`.
 *
 * In CommonMark a single "\n" inside a paragraph is a "soft break": it is
 * kept as a literal newline character inside the surrounding mdast `text`
 * node, and every renderer (ours included) turns that into a plain space.
 * That is what made a message typed with real line breaks collapse into
 * one line once it went through react-markdown.
 *
 * `remark-breaks` fixes this by rewriting each soft break into a real
 * mdast `break` node (which renders as `<br />`). We do the same thing by
 * hand instead of adding that package (or `unist-util-visit`) as a new
 * dependency: this is a published SDK, and the tree walk below is a dozen
 * lines.
 *
 * Only `text` nodes carry this problem. Fenced/indented code, inline code
 * spans and raw HTML passthrough all keep their literal newlines as part
 * of their own syntax (a `code`/`inlineCode` node's content lives in
 * `value`, not in child `text` nodes, and an `html` node is a leaf too),
 * so the walk below never touches them - it only ever rewrites `text`
 * children, and only descends into nodes that actually have children.
 *
 * Existing hard breaks (two trailing spaces, or a trailing backslash,
 * before a newline) are already parsed into their own `break` node by the
 * time a remark plugin sees the tree - the newline itself is consumed by
 * that syntax and never ends up inside a `text` node's value. So there is
 * nothing left for this plugin to find there, and it cannot double them.
 */

export interface MarkdownAstNode {
  type: string;
  value?: string;
  children?: MarkdownAstNode[];
  [key: string]: unknown;
}

// Leaf node types whose `value` is not prose and must never be split on
// "\n". None of these ever carry a `children` array in practice, so the
// walk already skips them - this set just makes that guarantee explicit
// and keeps it true even if that ever changes upstream.
const LEAVE_VALUE_ALONE = new Set(['code', 'inlineCode', 'html']);

const splitTextNode = (node: MarkdownAstNode): MarkdownAstNode[] => {
  const value = node.value ?? '';
  if (!value.includes('\n')) return [node];

  const lines = value.split('\n');
  const split: MarkdownAstNode[] = [];

  lines.forEach((line, index) => {
    if (line.length > 0) {
      split.push({ type: 'text', value: line });
    }
    if (index < lines.length - 1) {
      split.push({ type: 'break' });
    }
  });

  // A text node that is only newlines (e.g. the whole message body is
  // "\n") splits into empty strings on every side - fall back to a single
  // break rather than emitting nothing.
  return split.length > 0 ? split : [{ type: 'break' }];
};

const walk = (node: MarkdownAstNode): void => {
  if (!node.children || node.children.length === 0) return;
  if (LEAVE_VALUE_ALONE.has(node.type)) return;

  const nextChildren: MarkdownAstNode[] = [];

  for (const child of node.children) {
    if (child.type === 'text') {
      nextChildren.push(...splitTextNode(child));
      continue;
    }

    walk(child);
    nextChildren.push(child);
  }

  node.children = nextChildren;
};

/**
 * Remark plugin: turns every soft line break in the document into a real
 * `break` node. Usage mirrors any other remark plugin:
 *
 *   remarkPlugins={[remarkGfm, remarkLineBreaks]}
 */
export const remarkLineBreaks = () => (tree: MarkdownAstNode): void => {
  walk(tree);
};

export default remarkLineBreaks;
