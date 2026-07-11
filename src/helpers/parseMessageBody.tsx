import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { MessageMention } from '../types/types';
import { isSameXmppUsername } from './xmppUsername';

// Wraps each mention's exact source-text range in a <mention> pseudo-tag so
// rehypeRaw (already enabled below) turns it into a real element we can
// style via the `mention` entry in `components` - offsets are into the
// ORIGINAL text, so this must run before ReactMarkdown touches anything.
const injectMentionMarkup = (
  text: string,
  mentions?: MessageMention[]
): string => {
  if (!mentions || mentions.length === 0) return text;
  const sorted = [...mentions]
    .filter((m) => m.begin >= 0 && m.end <= text.length && m.begin < m.end)
    .sort((a, b) => a.begin - b.begin);

  let result = '';
  let cursor = 0;
  for (const mention of sorted) {
    if (mention.begin < cursor) continue; // overlapping/out-of-order, skip
    result += text.slice(cursor, mention.begin);
    const mentionText = text.slice(mention.begin, mention.end);
    result += `<mention data-username="${mention.xmppUsername}">${mentionText}</mention>`;
    cursor = mention.end;
  }
  result += text.slice(cursor);
  return result;
};

export const parseMessageBody = ({
  text,
  mentions,
  currentXmppUsername,
  onMentionClick,
}: {
  text: string;
  mentions?: MessageMention[];
  currentXmppUsername?: string;
  onMentionClick?: (xmppUsername: string) => void;
}) => {
  if (!text) return null;

  const markupText = injectMentionMarkup(text, mentions);

  return (
    <div
      style={{
        fontFamily:
          'var(--ethora-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
        fontSize: 'var(--ethora-font-size, 16px)',
        color: '#24292f',
        lineHeight: 1.6,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          mention: ({ node, children, ...props }: any) => {
            const mentionedUsername = props['data-username'];
            const isSelf = isSameXmppUsername(
              mentionedUsername,
              currentXmppUsername
            );
            const clickable = !!onMentionClick && !!mentionedUsername;
            return (
              <span
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={
                  clickable
                    ? (event) => {
                        // Don't let it bubble into the bubble's own
                        // context-menu/reply click handlers.
                        event.stopPropagation();
                        onMentionClick!(mentionedUsername);
                      }
                    : undefined
                }
                onKeyDown={
                  clickable
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          onMentionClick!(mentionedUsername);
                        }
                      }
                    : undefined
                }
                style={{
                  fontWeight: 600,
                  color: isSelf ? '#fff' : '#0052CD',
                  backgroundColor: isSelf
                    ? 'rgba(0, 82, 205, 0.85)'
                    : 'rgba(0, 82, 205, 0.12)',
                  borderRadius: 4,
                  padding: '0 2px',
                  cursor: clickable ? 'pointer' : undefined,
                }}
              >
                {children}
              </span>
            );
          },
          a: ({ href, children }) => (
            <a
              href={href!}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#0a66c2', textDecoration: 'none' }}
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
                    backgroundColor: '#f1f3f4',
                    padding: '2px 4px',
                    borderRadius: 3,
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
                  backgroundColor: '#f6f8fa',
                  padding: '12px',
                  borderRadius: '6px',
                  overflowX: 'auto',
                  border: '1px solid #e1e4e8',
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
                  border: '1px solid #d0d7de',
                }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              style={{
                border: '1px solid #d0d7de',
                padding: '12px 16px',
                background: '#f6f8fa',
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
                border: '1px solid #d0d7de',
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
                borderTop: '1px solid #e1e4e8',
              }}
            />
          ),
        }}
      >
        {markupText}
      </ReactMarkdown>
    </div>
  );
};

export default parseMessageBody;
