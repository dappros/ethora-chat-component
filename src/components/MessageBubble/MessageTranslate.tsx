import React, { FC, useCallback, useState } from 'react';
import styled from 'styled-components';
import { IConfig, IMessage } from '../../types/types';
import { CustomDivider } from './CustomDivider';
import { CustomMessageText } from '../styled/StyledComponents';
import { useT } from '../../i18n/useT';
import { toBaseLanguage } from '../../i18n/strings';

interface MessageTranslateProps {
  message: IMessage;
  isUser: boolean;
  config?: IConfig;
}

const TranslateLink = styled.span<{ $color?: string }>`
  display: inline-block;
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  color: ${(p) => p.$color || '#0052CD'};
  &:hover {
    text-decoration: underline;
  }
`;

type Phase = 'idle' | 'loading' | 'done' | 'error';

/**
 * On-demand message translation (LinkedIn-style). Renders a "Translate" link
 * under an incoming message; on click it calls `config.translates.onTranslate`
 * (host endpoint) - or falls back to a server-provided translation already on
 * the message - and shows the result inline with a "Show original" toggle.
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
        const base = toBaseLanguage(targetLocale);
        result =
          message.translations?.[base]?.translatedText ||
          message.translations?.[targetLocale]?.translatedText;
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
  }, [originalText, translates, sourceLocale, targetLocale, message]);

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
        isUser={isUser}
        configColorUser={config?.colors?.secondary}
        configColor={config?.colors?.primary}
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
