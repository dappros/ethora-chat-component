import { IMessage } from '../types/types';
import { toBaseLanguage } from './toBaseLanguage';

export interface ResolvedMessageTranslation {
  /**
   * Whether this message would need translating for this reader at all: a
   * known source language whose base differs from the reader's, and actual
   * translatable text. False means there is nothing to reveal, no matter
   * what a host `onTranslate` or a translate service might otherwise find -
   * a bare number, an emoji-only reaction, an untagged message, or a
   * message already in the reader's language.
   */
  needsTranslation: boolean;
  /**
   * True when a real, non-identical translation is already attached to the
   * message (`message.translations`) for this reader - safe to render with
   * no network call at all.
   */
  hasTranslation: boolean;
  /**
   * The server is still translating the message into the reader's language
   * (mod_translate, async mode): show "Translating…". Never true together
   * with hasTranslation.
   */
  isPending: boolean;
  /** When isPending stops being true by itself (epoch ms), 0 if never. */
  pendingUntil: number;
  originalText: string;
  /** hasTranslation ? the translation : originalText - always safe to render directly. */
  displayText: string;
}

export const TRANSLATION_PENDING_MAX_AGE_MS = 3 * 60_000;

const sentAtMs = (message: Pick<IMessage, 'id' | 'date'>): number => {
  const m = /^(\d{13})/.exec(String(message?.id || ''));
  if (m) return Number(m[1]);
  const t = message?.date ? new Date(message.date as any).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};

// "42", "+1 (555) 123-4567", "3.14159" - text with no actual letters has
// nothing to translate.
const hasNoLetters = (text: string): boolean => !/\p{L}/u.test(text);

/**
 * Resolve "what translation do we have for this message, for this reader" -
 * pure, synchronous, no HTTP. This is the ONE place that reads
 * `message.translations` and decides whether what it finds counts as a real
 * translation.
 *
 * Auto mode (`useMessageTranslation`) and manual mode (`MessageTranslate`)
 * both call this instead of keeping their own copies of the lookup, so they
 * can never drift into showing different things for the same message: manual
 * mode's click-to-reveal shows exactly what auto mode would have rendered
 * automatically, because both ask this same function the same question.
 */
export const resolveMessageTranslation = (
  message: Pick<
    IMessage,
    | 'body'
    | 'langSource'
    | 'translations'
    | 'translationPending'
    | 'translationPendingSince'
    | 'id'
    | 'date'
  >,
  readerLocale?: string
): ResolvedMessageTranslation => {
  const originalText = message?.body || '';
  const source = message?.langSource;
  const targetBase = toBaseLanguage(readerLocale || 'en');
  const sourceBase = toBaseLanguage(source);

  // Nothing to do when we don't know the source language, the message is
  // already in the reader's language (region ignored: en-US vs en-CA is the
  // same language, not a translation job), or there's no actual text to
  // translate (a bare number, a phone number, an emoji-only reaction).
  const trimmedText = originalText.trim();
  const needsTranslation =
    !!trimmedText &&
    !!source &&
    sourceBase !== targetBase &&
    !hasNoLetters(trimmedText);

  const result = needsTranslation
    ? message?.translations?.[readerLocale || '']?.translatedText ||
      message?.translations?.[targetBase]?.translatedText
    : undefined;

  // A "translation" that's byte-identical to the original (mistagged
  // langSource, a no-op from the source, matching proper nouns/numbers in
  // otherwise-different text) is worse than nothing: it renders the same
  // sentence twice - a small quote block above, then the body repeating
  // it verbatim. Treat identical-after-trim as "nothing to show" rather
  // than a real translation.
  const isRealTranslation =
    !!result && result.trim() !== originalText.trim();

  const sentAt = message?.translationPending
    ? message.translationPendingSince || sentAtMs(message)
    : 0;
  const pendingUntil =
    needsTranslation && !isRealTranslation && sentAt
      ? sentAt + TRANSLATION_PENDING_MAX_AGE_MS
      : 0;

  return {
    needsTranslation,
    hasTranslation: isRealTranslation,
    isPending: pendingUntil > Date.now(),
    pendingUntil,
    originalText,
    displayText: isRealTranslation ? (result as string) : originalText,
  };
};
