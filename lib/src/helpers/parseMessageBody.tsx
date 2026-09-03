import React, { Suspense } from 'react';

// The actual markdown renderer (react-markdown + remark-gfm + rehype-raw)
// lives in MarkdownBody.tsx and is code-split: it loads once, on the first
// message render, instead of shipping in the host's initial bundle. While
// it loads we show the raw text in the same wrapper so nothing jumps.
const MarkdownBody = React.lazy(() => import('./MarkdownBody'));

const wrapperStyle: React.CSSProperties = {
  fontFamily:
    'var(--ethora-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
  fontSize: 'var(--ethora-font-size, 16px)',
  color: '#24292f',
  lineHeight: 1.6,
};

export const parseMessageBody = ({ text }: { text: string }) => {
  if (!text) return null;

  return (
    <Suspense
      fallback={
        <div style={{ ...wrapperStyle, whiteSpace: 'pre-wrap' }}>{text}</div>
      }
    >
      <MarkdownBody text={text} />
    </Suspense>
  );
};

export default parseMessageBody;
