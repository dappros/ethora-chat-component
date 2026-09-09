import { safeJsonParse } from './safeJson';

/**
 * One bot-offered button, as carried by the `quickReplies` attribute on a
 * message stanza's <data> element. The wire format is the one the existing
 * Ethora bots already emit (see ethora-backend/tools/web3-bots/*: they stamp
 * `quickReplies: JSON.stringify(message.buttons)` with `{name, value}`
 * objects), so nothing on the bot side has to change to light these up.
 *
 * `questionId` is the only addition: quiz-style flows need a stable id for
 * the answer they collect, and it is optional so plain "yes/no" bots keep
 * working. When it is absent we fall back to the button's index.
 */
export interface QuickReply {
  /** Label shown on the chip. */
  name: string;
  /** Text sent back to the room when the chip is tapped. */
  value: string;
  /** Quiz question this button answers, used to build the answer URL. */
  questionId?: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

/**
 * Decode the `quickReplies` payload into buttons. Deliberately forgiving:
 * the attribute is written by bots (and, once the LLM-driven flow lands, by
 * a model), so anything unparseable must degrade to "no buttons" rather
 * than break the message. Accepts the already-decoded array too, since
 * getDataFromXml decodes it in place the same way it does `mentions`.
 */
export const parseQuickReplies = (rawValue: unknown): QuickReply[] => {
  const parsed = Array.isArray(rawValue)
    ? rawValue
    : safeJsonParse<unknown>(rawValue, []);

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry): QuickReply | null => {
      // Shorthand: a bare string is both label and value.
      if (isNonEmptyString(entry)) {
        return { name: entry, value: entry };
      }
      if (!entry || typeof entry !== 'object') return null;

      const candidate = entry as Record<string, unknown>;
      const name = isNonEmptyString(candidate.name)
        ? candidate.name
        : isNonEmptyString(candidate.title)
          ? (candidate.title as string)
          : undefined;
      const value = isNonEmptyString(candidate.value)
        ? candidate.value
        : name;

      if (!name || !value) return null;

      return {
        name,
        value,
        questionId: isNonEmptyString(candidate.questionId)
          ? candidate.questionId
          : undefined,
      };
    })
    .filter((entry): entry is QuickReply => entry !== null);
};

/**
 * Which message ids the user has already answered. Module-level rather than
 * component state because MessageList unmounts rows outside its render
 * window - state living in the bubble would come back "unanswered" after a
 * scroll. Session-scoped on purpose: this is display state, and the answer
 * itself lives on the server.
 */
const answeredMessageIds = new Set<string>();

export const markQuickRepliesAnswered = (messageId: string) => {
  if (messageId) answeredMessageIds.add(messageId);
};

export const hasAnsweredQuickReplies = (messageId: string): boolean =>
  !!messageId && answeredMessageIds.has(messageId);

/** Test seam - the set is process-wide. */
export const resetAnsweredQuickReplies = () => answeredMessageIds.clear();
