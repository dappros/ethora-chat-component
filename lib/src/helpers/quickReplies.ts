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
 * Which message ids the user has already answered, and therefore whose
 * buttons are gone.
 *
 * Module-level rather than component state because MessageList unmounts
 * rows outside its render window - state living in the bubble would bring
 * the spent buttons back after a scroll.
 *
 * Mirrored into sessionStorage because a reload would otherwise do the same
 * thing, and re-offering a question the user already answered is worse than
 * a cosmetic glitch: tapping again posts a second answer. Session-scoped,
 * not local: it is display state about one visit, and the answers
 * themselves are in the room.
 */
const ANSWERED_STORAGE_KEY = 'ethora-answered-quick-replies';

const readPersisted = (): string[] => {
  try {
    const raw = globalThis.sessionStorage?.getItem(ANSWERED_STORAGE_KEY);
    const parsed = safeJsonParse<unknown>(raw, []);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    // No sessionStorage (SSR, a browser with site data blocked): the set
    // still works for this page load, it just will not survive a reload.
    return [];
  }
};

const answeredMessageIds = new Set<string>(readPersisted());

const persist = () => {
  try {
    globalThis.sessionStorage?.setItem(
      ANSWERED_STORAGE_KEY,
      JSON.stringify([...answeredMessageIds])
    );
  } catch {
    // ignore - see readPersisted
  }
};

export const markQuickRepliesAnswered = (messageId: string) => {
  if (!messageId) return;
  answeredMessageIds.add(messageId);
  persist();
};

export const hasAnsweredQuickReplies = (messageId: string): boolean =>
  !!messageId && answeredMessageIds.has(messageId);

/** Test seam - the set is process-wide. */
export const resetAnsweredQuickReplies = () => {
  answeredMessageIds.clear();
  persist();
};
