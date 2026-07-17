import { IMessage } from '../types/types';
import { toBaseLanguage } from '../helpers/toBaseLanguage';

export interface MessageTranslationState {
  /** False when the message is already in the reader's language, or no
   * translation is available - render the plain body, no quote. */
  hasTranslation: boolean;
  originalText: string;
  /** Translation when hasTranslation, else the original - always safe to
   * render directly. */
  displayText: string;
}

// "42", "+1 (555) 123-4567", "3.14159" - text with no actual letters has
// nothing to translate.
const hasNoLetters = (text: string): boolean => !/\p{L}/u.test(text);

/**
 * Translation for ONE message, into the reader's language only.
 *
 * Pure and synchronous - no HTTP call. Every translation this client ever
 * shows arrives over XMPP already: the sender tags outgoing messages with
 * `<translate source="xx"/>` (see sendTextMessageWithTranslateTag) and
 * whatever process attaches actual translations does so server-side,
 * landing on `message.translations` when the stanza is parsed (see
 * getDataFromXml). This function only ever reads that - it never calls a
 * translation service itself, so there's nothing to fail when one isn't
 * reachable, and nothing to await.
 *
 * A message sent before the sender had translate-sending turned on simply
 * never got tagged, so it has no translation to show - not an error, just
 * absence of the underlying data (see the enable/disable-translates
 * disclaimer in LanguageSelectorModal).
 */
export const useMessageTranslation = (
  message: Pick<IMessage, 'body' | 'langSource' | 'translations'>,
  readerLocale?: string,
  enabled = true
): MessageTranslationState => {
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
    enabled &&
    !!trimmedText &&
    !!source &&
    sourceBase !== targetBase &&
    !hasNoLetters(trimmedText);

  const result = needsTranslation
    ? message?.translations?.[readerLocale || '']?.translatedText ||
      message?.translations?.[targetBase]?.translatedText
    : undefined;

  return {
    hasTranslation: !!result,
    originalText,
    displayText: result || originalText,
  };
};
