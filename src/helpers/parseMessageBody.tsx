import React, { Suspense } from 'react';
import { IMentionSpan } from '../types/types';
import { spliceMentionMarkup } from './mentions';

// The actual markdown renderer (react-markdown + remark-gfm + rehype-raw)
// lives in MarkdownBody.tsx and is code-split: it loads once, on the first
// message render, instead of shipping in the host's initial bundle. While
// it loads we show the raw text in the same wrapper so nothing jumps.
const MarkdownBody = React.lazy(() => import('./MarkdownBody'));

const wrapperStyle: React.CSSProperties = {
  fontFamily:
    'var(--ethora-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
  fontSize: 'var(--ethora-font-size, 16px)',
  // Same token MarkdownBody resolves to, so the pre-load text does not
  // change colour when the lazy chunk arrives (and follows the dark scheme).
  color: 'var(--ethora-color-text, #24292f)',
  lineHeight: 1.6,
};

export interface MentionClickHandler {
  (mention: { jid: string; name: string }): void;
}

interface ParseMessageBodyArgs {
  text: string;
  mentions?: IMentionSpan[];
  onMentionClick?: MentionClickHandler;
}

export const parseMessageBody = ({
  text,
  mentions,
  onMentionClick,
}: ParseMessageBodyArgs) => {
  if (!text) return null;

  // Mention spans get spliced into raw `<mention>` markup BEFORE the text
  // reaches ReactMarkdown/rehype-raw - see MarkdownBody.tsx's `mention`
  // components-map entry, which mirrors the same "component override for a
  // custom tag" mechanism already used there for `a`/`code`/`table`/etc.
  const bodyWithMentions = spliceMentionMarkup(text, mentions);

  return (
    <Suspense
      fallback={
        <div style={{ ...wrapperStyle, whiteSpace: 'pre-wrap' }}>{text}</div>
      }
    >
      <MarkdownBody text={bodyWithMentions} onMentionClick={onMentionClick} />
    </Suspense>
  );
};

export default parseMessageBody;
