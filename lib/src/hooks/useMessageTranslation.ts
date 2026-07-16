import { useEffect, useState } from 'react';
import { IMessage } from '../types/types';
import { fetchMessageTranslations } from '../networking/api-requests/translate.api';
import { toBaseLanguage } from '../helpers/toBaseLanguage';

export interface MessageTranslationState {
  /** False when the message is already in the reader's language, or no
   * translation is available (yet) - render the plain body, no quote. */
  hasTranslation: boolean;
  originalText: string;
  /** Translation when hasTranslation, else the original - always safe to
   * render directly. */
  displayText: string;
}

// "42", "+1 (555) 123-4567", "3.14159" - text with no actual letters has
// nothing to translate. Skipping these means the client never sends a
// translate request for them at all, not just that the UI hides the result.
const hasNoLetters = (text: string): boolean => !/\p{L}/u.test(text);

// Translations are per (text, target language) - NOT per message id: the
// same text sent twice, or the same message re-keyed by a MAM refetch,
// should cost one request, not two. Module-level so it survives remounts
// (scrolling a message out of view and back must not re-request).
const translationCache = new Map<string, string>();
const inFlight = new Map<string, Promise<void>>();

const cacheKey = (text: string, source: string, target: string) =>
  `${toBaseLanguage(source)}>${toBaseLanguage(target)}|${text}`;

/** Test-only: the cache is module state and would leak between cases. */
export const resetMessageTranslationCacheForTests = () => {
  translationCache.clear();
  inFlight.clear();
};

/**
 * Translation for ONE message, into the reader's language only.
 *
 * The sender doesn't pre-translate (that put an HTTP round trip in front of
 * every send, translating into languages nobody may read). Instead each
 * reader translates what they actually look at, into the one language they
 * actually read - so cost scales with what's on screen, and the result is
 * cached across renders/remounts.
 *
 * Server-attached translations (`message.translations`, from a
 * pre-translating sender or a legacy stanza) win and skip the request.
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

  // Only consult stanza-attached translations when a translation is
  // actually wanted: a message already in the reader's language ships a
  // same-language entry (pt->pt), and reading it blindly would render a
  // pointless "original + identical translation" pair - and would do it
  // even in on-demand mode, which owns its own click-to-reveal flow.
  const fromStanza = needsTranslation
    ? message?.translations?.[readerLocale || '']?.translatedText ||
      message?.translations?.[targetBase]?.translatedText
    : undefined;

  const key = needsTranslation ? cacheKey(originalText, source!, targetBase) : '';
  const [translated, setTranslated] = useState<string | undefined>(() =>
    key ? translationCache.get(key) : undefined
  );

  useEffect(() => {
    if (!needsTranslation || fromStanza) return;

    const cached = translationCache.get(key);
    if (cached) {
      setTranslated(cached);
      return;
    }

    let cancelled = false;
    const request =
      // Dedupe concurrent callers: the same text rendered in several
      // bubbles (or a re-render mid-flight) must not fan out into
      // duplicate requests for one answer.
      inFlight.get(key) ??
      fetchMessageTranslations(originalText, source!, [targetBase])
        .then((entries) => {
          // Cache under each language the service actually returned, keyed
          // the same way lookups are - so a later render hits the cache.
          entries.forEach((entry) => {
            translationCache.set(
              cacheKey(originalText, source!, entry.language),
              entry.translatedText
            );
          });
        })
        .finally(() => inFlight.delete(key));

    inFlight.set(key, request);
    void request.then(() => {
      if (!cancelled) setTranslated(translationCache.get(key));
    });

    return () => {
      cancelled = true;
    };
  }, [needsTranslation, fromStanza, key, originalText, source, targetBase]);

  const result = fromStanza || (needsTranslation ? translated : undefined);

  return {
    hasTranslation: !!result,
    originalText,
    displayText: result || originalText,
  };
};
