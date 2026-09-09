/**
 * Message bodies go through `rehype-raw`, so raw HTML typed by a remote
 * user becomes real DOM. These tests pin the sanitiser that has to run
 * after it: the dangerous half must disappear, and ordinary markdown
 * must survive untouched.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import rehypeSanitize from 'rehype-sanitize';
import MarkdownBody from './MarkdownBody';
import { markdownSanitizeSchema } from './markdownSanitizeSchema';

// Renders MarkdownBody directly rather than going through parseMessageBody:
// that helper lazy-loads this component, so a synchronous render would
// assert against an empty Suspense fallback. The sanitiser lives here.
const renderBody = (text: string) => render(<MarkdownBody text={text} />);

describe('MarkdownBody sanitisation', () => {
  beforeEach(() => {
    (window as unknown as { __xssPwned?: boolean }).__xssPwned = false;
  });

  afterEach(() => {
    delete (window as unknown as { __xssPwned?: boolean }).__xssPwned;
    vi.restoreAllMocks();
  });

  it('drops a <script> tag without rendering or executing it', () => {
    const { container } = renderBody(
      'hello <script>window.__xssPwned = true;</script> world'
    );

    expect(container.querySelector('script')).toBeNull();
    // `strip` removes the element together with its contents, so the
    // source must not leak through as visible text either.
    expect(container.textContent).not.toContain('__xssPwned');
    expect((window as unknown as { __xssPwned?: boolean }).__xssPwned).toBe(
      false
    );
    expect(container.textContent).toContain('hello');
    expect(container.textContent).toContain('world');
  });

  it('strips an onerror handler from an injected image', () => {
    const { container } = renderBody(
      '<img src="https://example.com/a.png" onerror="window.__xssPwned = true">'
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('onerror')).toBeNull();
    expect(img?.outerHTML).not.toContain('onerror');
    expect(img?.getAttribute('src')).toBe('https://example.com/a.png');
  });

  it('strips event handlers and inline style from ordinary elements', () => {
    const { container } = renderBody(
      '<span onclick="window.__xssPwned = true" style="position:fixed;top:0">click</span>'
    );

    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span?.getAttribute('onclick')).toBeNull();
    expect(span?.getAttribute('style')).toBeNull();
  });

  it('neutralises a javascript: link written as markdown', () => {
    const { container } = renderBody(
      '[click me](javascript:window.__xssPwned=true)'
    );

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href') ?? '').not.toContain('javascript:');
  });

  it('neutralises a javascript: link written as raw HTML', () => {
    const { container } = renderBody(
      '<a href="javascript:window.__xssPwned=true">click me</a>'
    );

    const link = container.querySelector('a');
    expect(link?.getAttribute('href') ?? '').not.toContain('javascript:');
  });

  it('neutralises a data: URL image', () => {
    const { container } = renderBody(
      '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">'
    );

    const img = container.querySelector('img');
    expect(img?.getAttribute('src') ?? '').not.toContain('data:');
  });

  it('drops iframe, object and style elements', () => {
    const { container } = renderBody(
      '<iframe src="https://evil.example"></iframe>' +
        '<object data="https://evil.example"></object>' +
        '<style>body{display:none}</style>'
    );

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('object')).toBeNull();
    expect(container.querySelector('style')).toBeNull();
    expect(container.textContent).not.toContain('display:none');
  });
});

describe('parseMessageBody still renders normal markdown', () => {
  it('renders bold and italic', () => {
    const { container } = renderBody('**bold** and _italic_');

    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
  });

  it('renders a gfm table', () => {
    const { container } = renderBody(
      ['| a | b |', '| --- | --- |', '| 1 | 2 |'].join('\n')
    );

    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelectorAll('th')).toHaveLength(2);
    expect(container.querySelectorAll('td')).toHaveLength(2);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders a fenced code block and keeps the language class', () => {
    const { container } = renderBody('```ts\nconst a = 1;\n```');

    const code = container.querySelector('pre code');
    expect(code).not.toBeNull();
    expect(code?.className).toContain('language-ts');
    expect(code?.textContent).toContain('const a = 1;');
  });

  it('renders inline code without a language class', () => {
    const { container } = renderBody('use `npm run build` first');

    const code = container.querySelector('code');
    expect(code?.textContent).toBe('npm run build');
    expect(container.querySelector('pre')).toBeNull();
  });

  it('renders an https link with the app target/rel', () => {
    const { container } = renderBody('[Ethora](https://ethora.com)');

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://ethora.com');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders a mailto link', () => {
    const { container } = renderBody('[mail](mailto:hi@ethora.com)');

    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      'mailto:hi@ethora.com'
    );
  });

  it('renders an image with alt text', () => {
    const { container } = renderBody('![a cat](https://example.com/cat.png)');

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/cat.png');
    expect(img?.getAttribute('alt')).toBe('a cat');
  });

  it('renders strikethrough and task lists', () => {
    const { container } = renderBody(
      ['~~gone~~', '', '- [x] done', '- [ ] todo'].join('\n')
    );

    expect(container.querySelector('del')?.textContent).toBe('gone');
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect((boxes[0] as HTMLInputElement).checked).toBe(true);
    expect((boxes[0] as HTMLInputElement).disabled).toBe(true);
  });

  it('renders headings, lists and horizontal rules', () => {
    const { container } = renderBody(
      ['# Title', '', '- one', '- two', '', '---', ''].join('\n')
    );

    expect(container.querySelector('h1')?.textContent).toBe('Title');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelector('hr')).not.toBeNull();
  });

  it('keeps benign inline HTML that the pipeline already supported', () => {
    const { container } = renderBody('an <b>emphasis</b> and a <br> break');

    expect(container.querySelector('b')?.textContent).toBe('emphasis');
    expect(container.querySelector('br')).not.toBeNull();
  });
});

/**
 * The React tests above prove the rendered output is safe, but React and
 * `react-markdown`'s own `urlTransform` already neutralise some of these
 * on their own. These tests exercise the schema directly so a regression
 * in the schema itself is caught, independently of what React happens to
 * refuse to render.
 */
describe('markdownSanitizeSchema', () => {
  type HastElement = {
    type: 'element';
    tagName: string;
    properties: Record<string, unknown>;
    children: HastElement[];
  };

  const sanitizeElement = (element: HastElement): HastElement | undefined => {
    const transform = rehypeSanitize(markdownSanitizeSchema);
    const out = transform({
      type: 'root',
      children: [element],
    } as any) as unknown as { children: HastElement[] };
    return out.children[0];
  };

  const el = (
    tagName: string,
    properties: Record<string, unknown> = {}
  ): HastElement => ({ type: 'element', tagName, properties, children: [] });

  it('removes every event-handler attribute', () => {
    for (const handler of ['onerror', 'onError', 'onclick', 'onload']) {
      const out = sanitizeElement(
        el('img', { src: 'https://a/b.png', [handler]: 'x()' })
      );
      expect(out?.properties[handler]).toBeUndefined();
      expect(out?.properties.src).toBe('https://a/b.png');
    }
  });

  it('removes the style attribute', () => {
    const out = sanitizeElement(el('span', { style: 'position:fixed' }));
    expect(out?.properties.style).toBeUndefined();
  });

  it('removes javascript:, data: and vbscript: hrefs but keeps http(s)', () => {
    for (const href of [
      'javascript:alert(1)',

      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
    ]) {
      expect(
        sanitizeElement(el('a', { href }))?.properties.href
      ).toBeUndefined();
    }
    expect(
      sanitizeElement(el('a', { href: 'https://ethora.com' }))?.properties.href
    ).toBe('https://ethora.com');
  });

  it('keeps only language-* class names on code', () => {
    expect(
      sanitizeElement(el('code', { className: ['language-ts'] }))?.properties
        .className
    ).toEqual(['language-ts']);
    expect(
      sanitizeElement(el('code', { className: ['hljs', 'evil'] }))?.properties
        .className
    ).toEqual([]);
  });

  it('does not allow script, style, iframe or object through', () => {
    for (const tagName of ['script', 'style', 'iframe', 'object', 'embed']) {
      expect(markdownSanitizeSchema.tagNames).not.toContain(tagName);
    }
  });
});
