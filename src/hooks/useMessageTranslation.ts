import { IMessage } from '../types/types';
import { resolveMessageTranslation } from '../helpers/resolveMessageTranslation';

export interface MessageTranslationState {
  /** False when the message is already in the reader's language, or no
   * translation is available - render the plain body, no quote. */
  hasTranslation: boolean;
  originalText: string;
  /** Translation when hasTranslation, else the original - always safe to
   * render directly. */
  displayText: string;
}

/**
 * Translation for ONE message, into the reader's language only.
 *
 * Pure and synchronous - no HTTP call. Every translation this client ever
 * shows arrives over XMPP already: the sender tags outgoing messages with
 * `<translate source="xx"/>` (see sendTextMessageWithTranslateTag) and
 * whatever process attaches actual translations does so server-side,
 * landing on `message.translations` when the stanza is parsed (see
 * getDataFromXml). This hook is a thin wrapper around
 * `resolveMessageTranslation` (the shared lookup manual mode also uses) - it
 * never calls a translation service itself, so there's nothing to fail when
 * one isn't reachable, and nothing to await.
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
  const resolved = resolveMessageTranslation(message, readerLocale);

  if (!enabled) {
    return {
      hasTranslation: false,
      originalText: resolved.originalText,
      displayText: resolved.originalText,
    };
  }

  return {
    hasTranslation: resolved.hasTranslation,
    originalText: resolved.originalText,
    displayText: resolved.displayText,
  };
};
