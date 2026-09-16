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
  originalText: string;
  /** hasTranslation ? the translation : originalText - always safe to render directly. */
  displayText: string;
}

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
  message: Pick<IMessage, 'body' | 'langSource' | 'translations'>,
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

  return {
    needsTranslation,
    hasTranslation: isRealTranslation,
    originalText,
    displayText: isRealTranslation ? (result as string) : originalText,
  };
};
