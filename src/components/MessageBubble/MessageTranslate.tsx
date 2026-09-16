import React, { FC, useCallback, useState } from 'react';
import styled from 'styled-components';
import { IConfig, IMessage } from '../../types/types';
import { CustomDivider } from './CustomDivider';
import { CustomMessageText } from '../styled/StyledComponents';
import { useT } from '../../i18n/useT';
import { toBaseLanguage } from '../../i18n/strings';
import { useAppDispatch } from '../../hooks/hooks';
import { setMessageTranslation } from '../../roomStore/roomsSlice';
import { deriveTranslateEndpoint } from '../../helpers/deriveTranslateEndpoint';
import { fetchTranslation } from '../../networking/api-requests/translate.api';

interface MessageTranslateProps {
  message: IMessage;
  isUser: boolean;
  config?: IConfig;
}

const TranslateLink = styled.span<{ $color?: string }>`
  display: inline-block;
  margin-top: 4px;
  font-size: var(--ethora-font-size-xs, 12px);
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  color: ${(p) => p.$color || 'var(--ethora-color-primary, #0052CD)'};
  &:hover {
    text-decoration: underline;
  }
  &:focus-visible {
    outline: 2px solid var(--ethora-color-primary, #0052cd);
    outline-offset: 2px;
    border-radius: var(--ethora-radius-sm, 4px);
  }
`;

type Phase = 'idle' | 'loading' | 'done' | 'error';

/**
 * Manual-mode message translation (LinkedIn-style). Renders a "Translate"
 * link under an incoming message; on click it resolves a translation in
 * this order:
 *
 *  1. `config.translates.onTranslate` (host-provided) - wins whenever set;
 *  2. whatever translation already arrived attached to the stanza
 *     (`message.translations`) - free, no request;
 *  3. a fetch from the translate service at `config.translates.endpoint`
 *     (or one derived from `config.baseUrl`, see deriveTranslateEndpoint) -
 *     only when neither of the above produced anything and an endpoint
 *     could be resolved. The result is cached onto the message in the
 *     store (setMessageTranslation) so a second click - and 'auto' mode,
 *     if the reader switches to it - see it for free, even after this
 *     bubble unmounts and remounts (long rooms remount bubbles on scroll).
 *
 * A message with nothing attached, no host `onTranslate`, and no
 * resolvable endpoint (or a failed/empty fetch) simply has nothing to
 * reveal (see `translation.failed`, clickable to retry).
 *
 * Visibility: `config.translates.showTranslateForMessage(message)` if the host
 * supplies it (they keep the locale logic and just tell us yes/no); otherwise
 * we compare the message's source base-language with the reader's base-language
 * (region ignored, so en-US vs en-CA shows nothing). The reader's FULL locale
 * (fr-CA vs fr-FR) is still forwarded to `onTranslate` as `targetLocale`.
 */
const MessageTranslate: FC<MessageTranslateProps> = ({
  message,
  isUser,
  config,
}) => {
  const t = useT();
  const dispatch = useAppDispatch();
  const [phase, setPhase] = useState<Phase>('idle');
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const translates = config?.translates;
  const originalText = String(message?.body || '');
  const sourceLocale = (message as { langSource?: string })?.langSource;
  const targetLocale =
    translates?.readerLocale || config?.i18n?.locale || 'en';
  const linkColor = config?.colors?.primary;

  const shouldShow = (() => {
    if (typeof translates?.showTranslateForMessage === 'function') {
      return translates.showTranslateForMessage(message);
    }
    if (!originalText.trim() || !sourceLocale) return false;
    return toBaseLanguage(sourceLocale) !== toBaseLanguage(targetLocale);
  })();

  // Exact locale first (the service echoes the reader's own locale key
  // verbatim when it can, e.g. "fr-CA"), then base language, so a reader
  // locale of "en" or "en-US" still matches a returned "en-CA" entry.
  const attachedTranslation = (): string | undefined => {
    return (
      message.translations?.[targetLocale]?.translatedText ||
      message.translations?.[toBaseLanguage(targetLocale)]?.translatedText
    );
  };

  const runTranslate = useCallback(async () => {
    if (!originalText.trim()) return;
    setPhase('loading');
    try {
      let result: string | undefined;
      if (typeof translates?.onTranslate === 'function') {
        result = await translates.onTranslate(originalText, {
          sourceLocale,
          targetLocale,
          message,
        });
      } else {
        result = attachedTranslation();
        if (!result) {
          const endpoint =
            translates?.endpoint || deriveTranslateEndpoint(config?.baseUrl);
          const entry = await fetchTranslation(
            originalText,
            sourceLocale,
            targetLocale,
            endpoint
          );
          if (entry?.translatedText) {
            result = entry.translatedText;
            dispatch(
              setMessageTranslation({
                roomJID: message.roomJid,
                messageId: message.id,
                locale: entry.language,
                entry,
              })
            );
          }
        }
      }
      if (result && result.trim()) {
        setTranslated(result);
        setPhase('done');
      } else {
        setPhase('error');
      }
    } catch {
      setPhase('error');
    }
    // attachedTranslation reads message.translations/targetLocale, both
    // already covered by their own deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalText, translates, sourceLocale, targetLocale, message, config?.baseUrl, dispatch]);

  if (!shouldShow) return null;

  if (phase === 'idle') {
    return (
      <TranslateLink $color={linkColor} onClick={runTranslate}>
        {t('action.translate')}
      </TranslateLink>
    );
  }

  if (phase === 'loading') {
    return (
      <TranslateLink $color={linkColor} as="span">
        {t('translation.translating')}
      </TranslateLink>
    );
  }

  if (phase === 'error') {
    return (
      <TranslateLink $color={linkColor} onClick={runTranslate}>
        {t('translation.failed')}
      </TranslateLink>
    );
  }

  // phase === 'done'
  return (
    <>
      <CustomDivider
        $isUser={isUser}
        $configColorUser={config?.colors?.secondary}
        $configColor={config?.colors?.primary}
      />
      <CustomMessageText>
        {showOriginal ? originalText : translated}
      </CustomMessageText>
      <TranslateLink
        $color={linkColor}
        onClick={() => setShowOriginal((v) => !v)}
      >
        {showOriginal ? t('action.translate') : t('action.showOriginal')}
      </TranslateLink>
    </>
  );
};

export default MessageTranslate;
