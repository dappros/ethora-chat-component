import React, { ReactNode, useMemo } from 'react';
import styled from 'styled-components';
import { TranslateGlobeIcon } from '../../assets/icons';
import { useT } from '../../i18n/useT';
import { useChatSettingState } from '../../hooks/useChatSettingState';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
`;

// The original the translation came from. Quoted with a real accent bar -
// the same visual language MessageReply uses for quoted content - rather
// than a literal "|" character in the text, which read as a stray glyph.
const OriginalQuote = styled.div<{ $accent: string }>`
  border-left: 2px solid ${({ $accent }) => $accent};
  padding-left: 8px;
  margin-bottom: 6px;
  font-size: var(--ethora-font-size-sm, 13px);
  line-height: 1.45;
  color: currentColor;
  opacity: 0.6;
  word-wrap: break-word;
`;

const SourceLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 3px;
  font-size: var(--ethora-font-size-xs, 11px);
  line-height: 1;
  opacity: 0.75;
  user-select: none;
`;

// parseMessageBody renders through ReactMarkdown, whose <p> carries
// `margin: 12px 0`. Stacked under the quote that became an ~18px dead gap,
// leaving the two texts looking unrelated rather than like one thought.
// Collapse only the OUTER margins, so a multi-paragraph message keeps its
// internal rhythm and the spacing here is owned by the quote's own
// margin-bottom.
//
// Two non-obvious details, both learned the hard way here:
//  - descendant (not child) selectors: parseMessageBody nests paragraphs
//    inside its own wrapper div, so `& > div > p` matches nothing;
//  - `!important`: that margin is an INLINE style, which outranks any
//    stylesheet rule regardless of specificity. Overriding inline styles
//    we don't own is the one job !important is actually right for.
const TranslatedText = styled.div`
  & p:first-of-type {
    margin-top: 0 !important;
  }
  & p:last-of-type {
    margin-bottom: 0 !important;
  }
`;

interface TranslatedMessageBodyProps {
  /** Text as sent, in the sender's language. */
  originalText: string;
  /** BCP-47 / ISO-639-1 of originalText, e.g. "en" or "en-CA". */
  sourceLanguage?: string;
  /**
   * Locale to write the label in. The whole label - the phrase AND the
   * language name inside it - resolves in this one locale, otherwise it
   * reads half-translated ("Translated from inglês"). Defaults to the UI
   * locale, since the label is chrome, not message content.
   */
  labelLocale?: string;
  accentColor?: string;
  /** Renders the translated text (markdown pipeline, mentions, etc). */
  children: ReactNode;
}

/**
 * Resolves "en" -> "English", localized into the reader's own language
 * (a Portuguese reader sees "inglês", not "English"). Intl.DisplayNames is
 * built into every browser we target, so this costs no bundle and no table
 * to maintain. Returns undefined for anything it can't name, so the label
 * degrades to a plain "Translated" rather than showing a raw code.
 */
const languageDisplayName = (
  languageCode?: string,
  readerLocale?: string
): string | undefined => {
  const base = String(languageCode || '').split('-')[0];
  if (!base) return undefined;

  let name: string | undefined;
  try {
    name = new Intl.DisplayNames([readerLocale || 'en'], {
      type: 'language',
    }).of(base);
  } catch {
    // Throws RangeError on a malformed tag.
    return undefined;
  }

  // For a well-formed but unknown code ("xx"), Intl echoes the code back
  // rather than returning undefined - which would surface as "Translated
  // from xx". Treat that as un-nameable.
  return !name || name.toLowerCase() === base.toLowerCase() ? undefined : name;
};

/**
 * A message body that is showing a translation: the translated text reads
 * as the primary content, with the original quoted above it for reference
 * and a small globe label explaining why there are two texts at all.
 */
export const TranslatedMessageBody: React.FC<TranslatedMessageBodyProps> = ({
  originalText,
  sourceLanguage,
  labelLocale,
  accentColor = '#0052CD',
  children,
}) => {
  const t = useT();
  const { config } = useChatSettingState();
  // useT resolves its phrases from config.i18n.locale - name the language
  // in that same locale so the two halves of the label agree.
  const resolvedLabelLocale = labelLocale || config?.i18n?.locale;
  const sourceName = useMemo(
    () => languageDisplayName(sourceLanguage, resolvedLabelLocale),
    [sourceLanguage, resolvedLabelLocale]
  );

  return (
    <Wrapper>
      <SourceLabel>
        <TranslateGlobeIcon color="currentColor" />
        {sourceName
          ? t('translation.fromLanguage', { language: sourceName })
          : t('translation.generic')}
      </SourceLabel>
      <OriginalQuote $accent={accentColor}>{originalText}</OriginalQuote>
      <TranslatedText>{children}</TranslatedText>
    </Wrapper>
  );
};

export default TranslatedMessageBody;
