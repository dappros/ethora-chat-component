import React, { FC, useCallback, useState } from 'react';
import styled from 'styled-components';
import { IConfig, IMessage } from '../../types/types';
import { CustomDivider } from './CustomDivider';
import { CustomMessageText } from '../styled/StyledComponents';
import { useT } from '../../i18n/useT';
import { useAppDispatch } from '../../hooks/hooks';
import { setMessageTranslation } from '../../roomStore/roomsSlice';
import { resolveMessageTranslation } from '../../helpers/resolveMessageTranslation';
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
 *     (`message.translations`), read through the SAME shared resolver
 *     `resolveMessageTranslation` that auto mode uses - free, no request,
 *     and guaranteed to show exactly what auto mode would have rendered
 *     automatically for this message;
 *  3. a fetch from the translate service, ONLY when the host has explicitly
 *     set `config.translates.endpoint` - the built-in HTTP call is opt-in,
 *     never a default. The result is cached onto the message in the store
 *     (setMessageTranslation) so a second click - and 'auto' mode, if the
 *     reader switches to it - see it for free, even after this bubble
 *     unmounts and remounts (long rooms remount bubbles on scroll).
 *
 * A message with nothing attached, no host `onTranslate`, and no explicit
 * `endpoint` simply has nothing to reveal - and in that case the link itself
 * does not render at all (see `shouldShow` below), rather than offering a
 * click that can only ever end in `translation.failed`. That retry link is
 * reserved for a genuine attempt that came back empty or threw (host
 * `onTranslate`, or an explicitly configured `endpoint`).
 *
 * Visibility: `config.translates.showTranslateForMessage(message)` if the host
 * supplies it (they keep the locale logic and just tell us yes/no); otherwise
 * the link shows only when the message actually needs translating for this
 * reader (same gate as auto mode: known source language, base-language
 * mismatch, actual translatable text) AND there is something that could
 * reveal a translation - an attached one, a host `onTranslate`, or an
 * explicit `endpoint`. The reader's FULL locale (fr-CA vs fr-FR) is still
 * forwarded to `onTranslate` as `targetLocale`.
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

  // The one place that decides whether there's a translation to show for
  // this message/reader pair - the exact same function auto mode calls, so
  // a click here can never reveal anything different than auto mode would
  // have rendered automatically.
  const resolved = resolveMessageTranslation(message, targetLocale);
  const hasHostTranslate = typeof translates?.onTranslate === 'function';
  const hasExplicitEndpoint = !!translates?.endpoint;

  const shouldShow = (() => {
    if (typeof translates?.showTranslateForMessage === 'function') {
      return translates.showTranslateForMessage(message);
    }
    // Nothing to translate at all (same gate as auto mode) - showing the
    // link would be misleading regardless of what could otherwise answer
    // it.
    if (!resolved.needsTranslation) return false;
    // Something to translate, but only worth a link when something could
    // actually reveal a result: it's already attached, the host has its own
    // translator, or an explicit endpoint is configured to fetch one. With
    // none of those, the link could only ever end in "Could not translate".
    return resolved.hasTranslation || hasHostTranslate || hasExplicitEndpoint;
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
        const attached = resolveMessageTranslation(message, targetLocale);
        result = attached.hasTranslation ? attached.displayText : undefined;
        // The built-in translate service is strictly opt-in: only called
        // when the host has explicitly set `config.translates.endpoint`.
        // There is no default derivation from `config.baseUrl` - a host
        // that hasn't configured a reachable, CORS-enabled endpoint gets no
        // network request at all, not a doomed one.
        if (!result && translates?.endpoint) {
          const entry = await fetchTranslation(
            originalText,
            sourceLocale,
            targetLocale,
            translates.endpoint
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
  }, [originalText, translates, sourceLocale, targetLocale, message, dispatch]);

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
