import { useCallback, useMemo, useState } from 'react';
import { IMentionSpan, RoomMember } from '../types/types';
import {
  computeEditRange,
  findActiveMentionQuery,
  findMentionEndingAt,
  MentionCandidate,
  rankMentionCandidates,
  shiftMentionSpans,
  validateMentionSpans,
} from '../helpers/mentions';

export const MENTION_INLINE_LIMIT = 5;

interface UseMentionComposerParams {
  roomMembers: RoomMember[];
  selfId?: string;
}

interface DropdownState {
  start: number;
  query: string;
}

/**
 * Tracks @-mention spans and the inline autocomplete dropdown for a plain
 * <input>/<textarea> based message composer (see SendInput.tsx). Text
 * editing and caret placement stay owned by the caller (a controlled React
 * input) - this hook only computes the *derived* state: which mention spans
 * still hold after an edit, and what the dropdown should show.
 */
export const useMentionComposer = ({
  roomMembers,
  selfId,
}: UseMentionComposerParams) => {
  const [mentionSpans, setMentionSpans] = useState<IMentionSpan[]>([]);
  const [dropdown, setDropdown] = useState<DropdownState | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [overflowOpen, setOverflowOpen] = useState(false);

  const candidates: MentionCandidate[] = useMemo(() => {
    if (!dropdown) return [];
    return rankMentionCandidates(dropdown.query, roomMembers, selfId);
  }, [dropdown, roomMembers, selfId]);

  const visibleCandidates = candidates.slice(0, MENTION_INLINE_LIMIT);
  const hasOverflow = candidates.length > MENTION_INLINE_LIMIT;

  const resetMentions = useCallback(() => {
    setMentionSpans([]);
    setDropdown(null);
    setHighlightedIndex(0);
    setOverflowOpen(false);
  }, []);

  const closeDropdown = useCallback(() => {
    setDropdown(null);
    setHighlightedIndex(0);
    setOverflowOpen(false);
  }, []);

  /** Call on every text change (before the caller commits `newText` to its
   * own state), with the caret position AFTER the edit. Updates tracked
   * mention spans (offset-shifted / dropped as needed) and opens/closes the
   * dropdown based on whether the caret now sits inside an "@query". */
  const handleTextChange = useCallback(
    (oldText: string, newText: string, caret: number) => {
      const { start, end, insertedLength } = computeEditRange(oldText, newText);
      const shifted = shiftMentionSpans(mentionSpans, start, end, insertedLength);
      const valid = validateMentionSpans(newText, shifted);
      setMentionSpans(valid);

      const active = findActiveMentionQuery(newText, caret);
      if (active) {
        setDropdown(active);
        setHighlightedIndex(0);
      } else {
        setDropdown(null);
        setOverflowOpen(false);
      }
    },
    [mentionSpans]
  );

  /** Replaces the in-progress "@query" with "@FullName " and records the
   * new mention span. Returns the new text + where the caret should land,
   * or null if there's no active dropdown to select from. */
  const selectCandidate = useCallback(
    (
      candidate: MentionCandidate,
      text: string,
      caretAtSelection: number
    ): { text: string; caret: number } | null => {
      if (!dropdown) return null;

      const insertion = `@${candidate.name} `;
      const newText =
        text.slice(0, dropdown.start) + insertion + text.slice(caretAtSelection);
      const newSpan: IMentionSpan = {
        jid: candidate.jid,
        name: candidate.name,
        offset: dropdown.start,
        length: candidate.name.length + 1, // "@Name", not the trailing space
      };

      const shifted = shiftMentionSpans(
        mentionSpans,
        dropdown.start,
        caretAtSelection,
        insertion.length
      );
      setMentionSpans(
        [...shifted, newSpan].sort((a, b) => a.offset - b.offset)
      );
      closeDropdown();

      return { text: newText, caret: dropdown.start + insertion.length };
    },
    [dropdown, mentionSpans, closeDropdown]
  );

  /** If the caret sits immediately after a complete mention token with no
   * active selection, returns the edit to atomically delete the whole
   * token; otherwise returns null so the caller falls through to normal
   * single-character Backspace. */
  const handleBackspace = useCallback(
    (
      text: string,
      selectionStart: number,
      selectionEnd: number
    ): { text: string; caret: number } | null => {
      if (selectionStart !== selectionEnd) return null;

      const span = findMentionEndingAt(mentionSpans, selectionStart);
      if (!span) return null;

      const newText = text.slice(0, span.offset) + text.slice(selectionStart);
      const remaining = mentionSpans.filter((s) => s !== span);
      const shifted = shiftMentionSpans(
        remaining,
        span.offset,
        span.offset + span.length,
        0
      );
      setMentionSpans(shifted);

      return { text: newText, caret: span.offset };
    },
    [mentionSpans]
  );

  const moveHighlight = useCallback(
    (delta: number) => {
      const count = visibleCandidates.length + (hasOverflow ? 1 : 0);
      if (count === 0) return;
      setHighlightedIndex((prev) => (prev + delta + count) % count);
    },
    [visibleCandidates.length, hasOverflow]
  );

  return {
    mentionSpans,
    setMentionSpans,
    dropdown,
    isDropdownOpen: !!dropdown,
    candidates,
    visibleCandidates,
    hasOverflow,
    highlightedIndex,
    setHighlightedIndex,
    moveHighlight,
    overflowOpen,
    setOverflowOpen,
    resetMentions,
    closeDropdown,
    handleTextChange,
    selectCandidate,
    handleBackspace,
  };
};

export type UseMentionComposerReturn = ReturnType<typeof useMentionComposer>;
