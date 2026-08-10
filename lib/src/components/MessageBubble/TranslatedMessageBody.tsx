import React, { ReactNode } from 'react';
import styled from 'styled-components';

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
  accentColor?: string;
  /** Renders the translated text (markdown pipeline, mentions, etc). */
  children: ReactNode;
  /**
   * Whether this message was sent by the current user. The sender already
   * knows what they wrote, so their own messages skip the quote-plus-
   * translation treatment and just show the original text.
   */
  isUser: boolean;
}

/**
 * A message body that is showing a translation: the translated text reads
 * as the primary content, with the original quoted above it for reference
 * - skipped for the current user's own messages (see `isUser`).
 */
export const TranslatedMessageBody: React.FC<TranslatedMessageBodyProps> = ({
  originalText,
  accentColor = '#0052CD',
  children,
  isUser
}) => {
  return (
    <Wrapper>
      {!isUser && <OriginalQuote $accent={accentColor}>{originalText}</OriginalQuote>}
      <TranslatedText>{isUser ? originalText : children}</TranslatedText>
    </Wrapper>
  );
};

export default TranslatedMessageBody;
