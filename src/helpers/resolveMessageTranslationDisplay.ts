import { IMessage } from '../types/types';

export interface MessageTranslationDisplay {
  /** False when the message was already sent in the reader's language -
   * nothing to show, render the plain original with no quote. */
  hasTranslation: boolean;
  originalText: string;
  /** The translated text when hasTranslation is true, otherwise the
   * original - always safe to render directly. */
  displayText: string;
}

// Same "already in the reader's language" comparison MessageTranslations.tsx
// used (base language only - fr-CA vs fr-FR still counts as a match), now
// shared so Message.tsx can also decide whether to show the small quoted
// original above the translated text.
export const resolveMessageTranslationDisplay = (
  message: Pick<IMessage, 'body' | 'langSource' | 'translations'>,
  readerLocale?: string
): MessageTranslationDisplay => {
  const locale = String(readerLocale || 'en');
  const base = locale.split('-')[0];
  const translated =
    message.translations?.[locale]?.translatedText ||
    message.translations?.[base]?.translatedText;

  const messageBase = String(message.langSource || '').split('-')[0];
  const hasTranslation = !!message.langSource && !!translated && messageBase !== base;

  return {
    hasTranslation,
    originalText: message.body,
    displayText: hasTranslation ? translated! : message.body,
  };
};
