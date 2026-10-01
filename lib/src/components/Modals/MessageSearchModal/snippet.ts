export interface SnippetPart {
  text: string;
  match: boolean;
}

const CONTEXT_BEFORE = 36;
const MAX_LENGTH = 150;

/**
 * The part of a message worth showing for a hit: a window around the first
 * match, cut on word boundaries with ellipses, split into matching and
 * non-matching runs so the caller can emphasise the match.
 *
 * Plain substring, case-insensitive, like the server's default mode. The
 * query is never used as a regular expression, so `.` or `(` in it are just
 * characters.
 */
export function buildSnippet(body: string, query: string): SnippetPart[] {
  const text = String(body || '')
    .replace(/\s+/g, ' ')
    .trim();
  const needle = String(query || '')
    .trim()
    .toLowerCase();
  if (!text) return [];

  const at = needle ? text.toLowerCase().indexOf(needle) : -1;

  let start = 0;
  if (at > CONTEXT_BEFORE) {
    start = at - CONTEXT_BEFORE;
    const space = text.indexOf(' ', start);
    if (space !== -1 && space < at) start = space + 1;
  }
  let end = Math.min(text.length, start + MAX_LENGTH);
  if (end < text.length) {
    const space = text.lastIndexOf(' ', end);
    if (space > start + MAX_LENGTH / 2 && space > at + needle.length)
      end = space;
  }

  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const slice = text.slice(start, end);

  if (at === -1 || at < start || at + needle.length > end) {
    return [{ text: `${prefix}${slice}${suffix}`, match: false }];
  }

  const from = at - start;
  const parts: SnippetPart[] = [];
  if (prefix || from > 0)
    parts.push({ text: `${prefix}${slice.slice(0, from)}`, match: false });
  parts.push({ text: slice.slice(from, from + needle.length), match: true });
  const rest = slice.slice(from + needle.length);
  if (rest || suffix) parts.push({ text: `${rest}${suffix}`, match: false });
  return parts;
}
