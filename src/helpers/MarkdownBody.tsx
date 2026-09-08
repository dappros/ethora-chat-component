import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { MentionClickHandler } from './parseMessageBody';

interface MarkdownBodyProps {
  text: string;
  onMentionClick?: MentionClickHandler;
}

// Loaded lazily via parseMessageBody.tsx, the markdown pipeline
// (react-markdown + remark-gfm + rehype-raw/parse5) is heavy, so it lives
// in its own chunk instead of the host's initial bundle.
const MarkdownBody = ({ text, onMentionClick }: MarkdownBodyProps) => {
  if (!text) return null;

  return (
    <div
      style={{
        fontFamily:
          'var(--ethora-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
        fontSize: 'var(--ethora-font-size, 15px)',
        color: 'var(--ethora-color-text, #24292f)',
        lineHeight: 1.45,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href!}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: 'var(--ethora-color-primary, #0a66c2)',
                textDecoration: 'none',
              }}
            >
              {children}
            </a>
          ),
          code: ({ node, className, children, ...props }) => {
            const isInline = !className;

            if (isInline) {
              return (
                <code
                  {...props}
                  style={{
                    backgroundColor: 'var(--ethora-color-bg-subtle, #f1f3f4)',
                    padding: '2px 4px',
                    borderRadius: 'var(--ethora-radius-sm, 3px)',
                    fontFamily: 'monospace',
                    fontSize: '0.9em',
                  }}
                >
                  {children}
                </code>
              );
            }

            return (
              <pre
                style={{
                  backgroundColor: 'var(--ethora-color-bg-subtle, #f6f8fa)',
                  padding: '12px',
                  borderRadius: 'var(--ethora-radius-sm, 6px)',
                  overflowX: 'auto',
                  border: '1px solid var(--ethora-color-border, #e1e4e8)',
                  fontSize: '14px',
                  lineHeight: '1.45',
                }}
              >
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          },

          table: ({ children }) => (
            <div style={{ overflowX: 'auto', margin: '16px 0' }}>
              <table
                style={{
                  borderCollapse: 'collapse',
                  width: '100%',
                  minWidth: '600px',
                  fontSize: '14px',
                  border: '1px solid var(--ethora-color-border, #d0d7de)',
                }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              style={{
                border: '1px solid var(--ethora-color-border, #d0d7de)',
                padding: '12px 16px',
                background: 'var(--ethora-color-bg-subtle, #f6f8fa)',
                textAlign: 'left',
                fontWeight: 600,
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                border: '1px solid var(--ethora-color-border, #d0d7de)',
                padding: '12px 16px',
                verticalAlign: 'top',
              }}
            >
              {children}
            </td>
          ),
          ul: ({ children }) => (
            <ul style={{ paddingLeft: '24px', margin: '12px 0' }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol style={{ paddingLeft: '24px', margin: '12px 0' }}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li style={{ marginBottom: '6px', lineHeight: '1.5' }}>
              {children}
            </li>
          ),
          p: ({ children }) => (
            <p style={{ margin: '12px 0', lineHeight: '1.6' }}>{children}</p>
          ),
          h1: ({ children }) => (
            <h1
              style={{
                fontSize: '2em',
                fontWeight: 'bold',
                marginTop: '24px',
                marginBottom: '16px',
              }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              style={{
                fontSize: '1.5em',
                fontWeight: 'bold',
                marginTop: '20px',
                marginBottom: '14px',
              }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              style={{
                fontSize: '1.25em',
                fontWeight: 'bold',
                marginTop: '16px',
                marginBottom: '12px',
              }}
            >
              {children}
            </h3>
          ),
          hr: () => (
            <hr
              style={{
                margin: '20px 0',
                border: 'none',
                borderTop: '1px solid var(--ethora-color-border, #e1e4e8)',
              }}
            />
          ),
          // Custom tag injected by spliceMentionMarkup (helpers/mentions.ts)
          // for each @-mention span. Falls back to plain, non-interactive
          // text if the jid is missing/malformed (e.g. an old message with
          // corrupt mentions data) rather than rendering a broken clickable
          // element.
          mention: ({ node, children, ...props }: any) => {
            const jid = props?.['data-jid'] as string | undefined;
            if (!jid) return <span>{children}</span>;

            const name = (props?.['data-name'] as string) || '';
            const handleClick = () => onMentionClick?.({ jid, name });

            return (
              <span
                role={onMentionClick ? 'button' : undefined}
                tabIndex={onMentionClick ? 0 : undefined}
                onClick={onMentionClick ? handleClick : undefined}
                onKeyDown={
                  onMentionClick
                    ? (event: React.KeyboardEvent) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleClick();
                        }
                      }
                    : undefined
                }
                style={{
                  color: 'var(--ethora-color-primary, #0052cd)',
                  fontWeight: 600,
                  cursor: onMentionClick ? 'pointer' : 'default',
                }}
              >
                {children}
              </span>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownBody;
