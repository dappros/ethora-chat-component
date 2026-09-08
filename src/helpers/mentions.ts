import { IMentionSpan } from '../types/types';
import { RoomMember } from '../types/types';

export interface MentionCandidate {
  jid: string;
  name: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const escapeAttr = (value: string): string =>
  escapeHtml(value).replace(/"/g, '&quot;');

// Best-effort JID for a room member: prefer an explicit `jid`, fall back to
// `xmppUsername` (bare local part is enough to identify the user for the
// profile-modal lookup - see resolveMentionUser).
export const memberJid = (member: RoomMember): string =>
  member.jid || member.xmppUsername || member._id || '';

export const memberFullName = (member: RoomMember): string =>
  `${member.firstName || ''} ${member.lastName || ''}`.trim() ||
  member.name ||
  member.xmppUsername ||
  '';

/**
 * Filters + ranks a room's members against a typed `@query` for the mention
 * autocomplete dropdown. Prefix matches outrank mid-string substring
 * matches; ties break alphabetically. The current user is always excluded
 * (no self-mention suggestion).
 */
export const rankMentionCandidates = (
  query: string,
  members: RoomMember[],
  selfId?: string
): MentionCandidate[] => {
  const q = query.trim().toLowerCase();
  const selfKey = String(selfId || '').split('@')[0];

  const scored: { candidate: MentionCandidate; rank: number }[] = [];

  for (const member of members) {
    const jid = memberJid(member);
    const localKey = jid.split('@')[0];
    if (selfKey && (localKey === selfKey || jid === selfId)) continue;

    const name = memberFullName(member);
    if (!name) continue;

    const lowerName = name.toLowerCase();
    let rank: number;
    if (q === '') {
      rank = 1;
    } else if (lowerName.startsWith(q)) {
      rank = 0;
    } else if (lowerName.includes(q)) {
      rank = 1;
    } else {
      continue;
    }

    scored.push({ candidate: { jid, name }, rank });
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.candidate.name.localeCompare(b.candidate.name);
  });

  return scored.map((s) => s.candidate);
};

/**
 * Detects an in-progress "@query" the caret is currently inside, so the
 * autocomplete dropdown knows whether to be open and what to filter by.
 * Only triggers when the `@` starts a "word" (start of input, or preceded
 * by whitespace) so it doesn't fire inside an email-looking string or an
 * existing word.
 */
export const findActiveMentionQuery = (
  text: string,
  caret: number
): { start: number; query: string } | null => {
  const upToCaret = text.slice(0, caret);
  const at = upToCaret.lastIndexOf('@');
  if (at === -1) return null;

  const before = at === 0 ? '' : upToCaret[at - 1];
  if (before && !/\s/.test(before)) return null;

  const query = upToCaret.slice(at + 1);
  // A space (or newline) inside the query ends the mention attempt.
  if (/\s/.test(query)) return null;

  return { start: at, query };
};

/**
 * Re-anchors mention spans after a text edit. `editStart`/`editEnd` are the
 * [start, end) range of the OLD text that was replaced, `insertedLength` is
 * how long the replacement text is. Spans entirely before the edit are left
 * alone; spans entirely after are shifted by the net length delta; a span
 * that overlaps the edited range is dropped (its underlying text is no
 * longer intact, so it's no longer a valid mention).
 */
export const shiftMentionSpans = (
  spans: IMentionSpan[],
  editStart: number,
  editEnd: number,
  insertedLength: number
): IMentionSpan[] => {
  const delta = insertedLength - (editEnd - editStart);

  return spans.reduce<IMentionSpan[]>((acc, span) => {
    const spanEnd = span.offset + span.length;

    if (spanEnd <= editStart) {
      // Entirely before the edit - untouched.
      acc.push(span);
      return acc;
    }

    if (span.offset >= editEnd) {
      // Entirely after the edit - shift by the net length change.
      acc.push({ ...span, offset: span.offset + delta });
      return acc;
    }

    // Overlaps the edit - the mention text was touched, drop it.
    return acc;
  }, []);
};

/**
 * Drops any span whose text no longer reads "@Name" in the current body
 * (e.g. a multi-character selection delete clipped part of it). Safety net
 * on top of shiftMentionSpans for edits that aren't tracked precisely.
 */
export const validateMentionSpans = (
  text: string,
  spans: IMentionSpan[]
): IMentionSpan[] =>
  spans.filter((span) => {
    if (span.offset < 0 || span.offset + span.length > text.length) {
      return false;
    }
    const slice = text.slice(span.offset, span.offset + span.length);
    return slice === `@${span.name}`;
  });

/** Finds a mention span whose token ends exactly at `caret` (i.e. the caret
 * sits right after a complete "@Name" token) - used to make Backspace
 * delete the whole token atomically instead of one character. */
export const findMentionEndingAt = (
  spans: IMentionSpan[],
  caret: number
): IMentionSpan | undefined =>
  spans.find((span) => span.offset + span.length === caret);

/**
 * Diffs two versions of the composer text (before/after a single onChange)
 * down to the edited range, via longest common prefix/suffix. Good enough
 * for the single-edit-at-a-time case a controlled <input>/<textarea>
 * onChange always is (typing, pasting, cutting, IME commit): everything
 * outside the diffed range is provably unchanged, which is what
 * shiftMentionSpans needs to re-anchor mention offsets correctly.
 */
export const computeEditRange = (
  oldText: string,
  newText: string
): { start: number; end: number; insertedLength: number } => {
  let prefix = 0;
  const maxPrefix = Math.min(oldText.length, newText.length);
  while (prefix < maxPrefix && oldText[prefix] === newText[prefix]) {
    prefix++;
  }

  let suffix = 0;
  const maxSuffix = Math.min(oldText.length, newText.length) - prefix;
  while (
    suffix < maxSuffix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }

  const start = prefix;
  const end = oldText.length - suffix;
  const insertedLength = newText.length - suffix - prefix;

  return { start, end, insertedLength };
};

/**
 * Splices mention spans into `text` as raw `<mention>` tags for the
 * markdown/rehype-raw pipeline to pick up (see parseMessageBody.tsx). Spans
 * are applied back-to-front so earlier offsets stay valid while splicing.
 */
export const spliceMentionMarkup = (
  text: string,
  spans: IMentionSpan[] | undefined
): string => {
  if (!spans || spans.length === 0) return text;

  const valid = validateMentionSpans(text, spans).sort(
    (a, b) => b.offset - a.offset
  );

  let result = text;
  for (const span of valid) {
    const before = result.slice(0, span.offset);
    const token = result.slice(span.offset, span.offset + span.length);
    const after = result.slice(span.offset + span.length);
    result = `${before}<mention data-jid="${escapeAttr(span.jid)}" data-name="${escapeAttr(
      span.name
    )}">${escapeHtml(token)}</mention>${after}`;
  }
  return result;
};
