import { defaultSchema } from 'rehype-sanitize';
import type { Options as SanitizeSchema } from 'rehype-sanitize';

/**
 * Sanitisation schema for message bodies.
 *
 * Message bodies are rendered with `rehype-raw`, which turns raw HTML
 * typed by a remote user into real elements. Without a sanitiser that
 * is a stored-XSS hole: `<img onerror>`, `<script>`, `javascript:` hrefs
 * and friends all end up in the DOM of every reader of the room.
 *
 * The schema below is derived from `hast-util-sanitize`'s `defaultSchema`
 * (the GitHub-comment schema) and then narrowed to exactly what our own
 * pipeline can produce: `remark-gfm` output (tables, task lists,
 * strikethrough, footnotes, autolinks), fenced code with a language
 * class, links and images. Everything else is dropped.
 *
 * Anything not named here is removed, which is what keeps us safe from
 * the interesting attributes: there is no `style`, no `srcset`, and no
 * `on*` handler in any of the allow-lists, so they cannot survive.
 */

/**
 * Attributes allowed on every element. Presentation-only leftovers of
 * the HTML that GitHub-flavoured markdown emits. Deliberately excludes
 * `style` (CSS injection / clickjacking) and every event handler.
 */
const globalAttributes: string[] = [
  'align',
  'alt',
  'checked',
  'colSpan',
  'dir',
  'headers',
  'height',
  'id',
  'lang',
  'rowSpan',
  'scope',
  'span',
  'start',
  'title',
  'value',
  'width',
];

/**
 * Elements our renderer can legitimately show. Note the absence of
 * `script`, `style`, `iframe`, `object`, `embed`, `form`, `link`,
 * `meta` and `base`: they are either scripting vectors or ways to
 * exfiltrate/overlay the host page.
 */
const tagNames: string[] = [
  // block
  'blockquote',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'p',
  'pre',
  'section',
  // lists (incl. gfm task lists)
  'dd',
  'dl',
  'dt',
  'input',
  'li',
  'ol',
  'ul',
  // tables (gfm)
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  // inline
  'a',
  'b',
  'br',
  'code',
  'del',
  'em',
  'i',
  'img',
  'ins',
  'kbd',
  'q',
  's',
  'samp',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'var',
  // collapsible sections, used by some bots
  'details',
  'summary',
];

export const markdownSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,

  // Keep the default's table-ancestor rules so a stray `<td>` outside a
  // table cannot be used to break the surrounding layout.
  ancestors: defaultSchema.ancestors,

  // `mention` is our own tag, spliced into the body by
  // helpers/mentions.ts and rendered by MarkdownBody's `mention`
  // override. It has to survive sanitisation or every @-mention
  // degrades to plain text.
  tagNames: [...tagNames, 'mention'],

  attributes: {
    '*': globalAttributes,

    // Only the two attributes MarkdownBody's `mention` renderer reads.
    // Both are written through escapeAttr in helpers/mentions.ts.
    mention: ['dataJid', 'dataName'],

    // Links: href only, and only over the protocols listed below.
    // `target`/`rel` are set by our own `a` renderer, not by the author.
    a: [
      'href',
      'ariaDescribedBy',
      'ariaLabel',
      'ariaLabelledBy',
      'dataFootnoteRef',
      'dataFootnoteBackref',
      ['className', 'data-footnote-backref'],
    ],

    // The only `className` that reaches application logic: the code
    // renderer reads `language-*` to decide inline vs. fenced block.
    code: [['className', /^language-[\w+-]*$/]],

    img: ['src', 'ariaDescribedBy', 'ariaLabel', 'ariaLabelledBy'],

    // gfm task lists render a disabled checkbox; `required` below pins
    // it so `<input type="text">`-style injections cannot slip through.
    input: [
      ['type', 'checkbox'],
      ['disabled', true],
    ],

    li: [['className', 'task-list-item']],
    ol: [
      ['className', 'contains-task-list'],
      'ariaDescribedBy',
      'ariaLabel',
      'ariaLabelledBy',
    ],
    ul: [
      ['className', 'contains-task-list'],
      'ariaDescribedBy',
      'ariaLabel',
      'ariaLabelledBy',
    ],

    section: ['dataFootnotes', ['className', 'footnotes']],
    table: ['ariaDescribedBy', 'ariaLabel', 'ariaLabelledBy'],

    blockquote: ['cite'],
    del: ['cite'],
    ins: ['cite'],
    q: ['cite'],
  },

  required: {
    input: { type: 'checkbox', disabled: true },
  },

  /**
   * URL schemes. `javascript:`, `data:` and `vbscript:` are absent, so a
   * link or image using them loses the attribute entirely.
   */
  protocols: {
    href: ['http', 'https', 'mailto', 'xmpp'],
    cite: ['http', 'https'],
    src: ['http', 'https'],
  },

  /**
   * Elements removed together with their contents. Unlisted disallowed
   * elements are only unwrapped, which would leak script/style source
   * into the message as visible text.
   */
  strip: ['script', 'style', 'iframe', 'object', 'embed', 'template'],

  // Prefix author-controlled `id`/`name` so a message cannot clobber
  // ids the host page relies on.
  clobber: defaultSchema.clobber,
  clobberPrefix: defaultSchema.clobberPrefix,
};

export default markdownSanitizeSchema;
