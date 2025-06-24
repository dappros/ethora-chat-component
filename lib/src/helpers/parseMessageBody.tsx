import React from 'react';

export const parseMessageBody = (text: string): (string | JSX.Element)[] => {
  if (typeof text !== 'string') return [text];

  let key = 0;
  const elements: (string | JSX.Element)[] = [];
  const lines = text.split('\n');

  let inCodeBlock = false;
  let codeLanguage = '';
  const codeBuffer: string[] = [];

  const parseInline = (input: string): (string | JSX.Element)[] => {
    const output: (string | JSX.Element)[] = [];

    const regex =
      /(\*\*\*[^*]+?\*\*\*|\*\*[^*]+?\*\*|\*[^*]+?\*|~~[^~]+?~~|`[^`]+?`|https:\/\/[\w.-]+(?:\.[\w.-]+)+[\w\-._~:/?#[\]@!$&'()*+,;=]+)/g;

    let lastIndex = 0;
    let match;

    while ((match = regex.exec(input)) !== null) {
      if (match.index > lastIndex) {
        output.push(input.slice(lastIndex, match.index));
      }

      const token = match[0];
      if (/^\*\*\*.*\*\*\*$/.test(token)) {
        output.push(
          <strong key={`b-${key++}`}>
            <em>{token.slice(3, -3)}</em>
          </strong>
        );
      } else if (/^\*\*.*\*\*$/.test(token)) {
        output.push(<strong key={`b-${key++}`}>{token.slice(2, -2)}</strong>);
      } else if (/^\*.*\*$/.test(token)) {
        output.push(<em key={`i-${key++}`}>{token.slice(1, -1)}</em>);
      } else if (/^~~.*~~$/.test(token)) {
        output.push(<del key={`s-${key++}`}>{token.slice(2, -2)}</del>);
      } else if (/^`.*`$/.test(token)) {
        output.push(
          <code
            key={`code-${key++}`}
            style={{
              background: '#eee',
              padding: '1px 4px',
              borderRadius: '4px',
            }}
          >
            {token.slice(1, -1).trim()}
          </code>
        );
      } else if (/^https:\/\//.test(token)) {
        output.push(
          <a
            key={`link-${key++}`}
            href={token}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'blue', textDecoration: 'underline' }}
          >
            {token}
          </a>
        );
      }

      lastIndex = match.index + token.length;
    }

    if (lastIndex < input.length) {
      output.push(input.slice(lastIndex));
    }

    return output;
  };

  const parseList = (
    startIndex: number
  ): { list: JSX.Element; newIndex: number } => {
    const items: JSX.Element[] = [];
    const isOrdered = /^\d+\./.test(lines[startIndex].trim());

    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];
      if (/^(\d+\.\s+|\-\s+)/.test(line)) {
        const itemText = line.replace(/^(\d+\.\s+|\-\s+)/, '');
        items.push(<li key={`li-${key++}`}>{parseInline(itemText)}</li>);
      } else if (line.trim() === '') {
        break;
      } else {
        break;
      }
      i++;
    }

    const ListTag = isOrdered ? 'ol' : 'ul';
    return {
      list: React.createElement(
        ListTag,
        {
          key: `list-${key++}`,
          style: { margin: '4px 0', paddingLeft: '20px' },
        },
        items
      ),
      newIndex: i - 1,
    };
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    if (!inCodeBlock && line.trim().startsWith('```')) {
      const match = line.trim().match(/^```(?:\s*(\w+))?/);
      inCodeBlock = true;
      codeLanguage = match?.[1] || '';
      continue;
    }

    if (inCodeBlock && line.trim() === '```') {
      inCodeBlock = false;
      elements.push(
        <pre
          key={`pre-${key++}`}
          style={{
            background: '#f0f0f0',
            padding: '10px',
            borderRadius: '8px',
            whiteSpace: 'pre-wrap',
          }}
        >
          <code className={`language-${codeLanguage}`}>
            {codeBuffer.join('\n')}
          </code>
        </pre>
      );
      codeBuffer.length = 0;
      codeLanguage = '';
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      const content = line.replace(/^#{1,6}\s/, '');
      elements.push(
        React.createElement(
          `h${level}`,
          { key: `h-${key++}` },
          ...parseInline(content)
        )
      );
      continue;
    }

    if (line.startsWith('>')) {
      elements.push(
        <blockquote
          key={`quote-${key++}`}
          style={{
            borderLeft: '3px solid #ccc',
            paddingLeft: '10px',
            color: '#666',
          }}
        >
          {parseInline(line.replace(/^>\s*/, ''))}
        </blockquote>
      );
      continue;
    }

    if (/^(\-|\d+\.)\s+/.test(line)) {
      const { list, newIndex } = parseList(idx);
      elements.push(list);
      idx = newIndex;
      continue;
    }

    if (line.trim() === '') {
      elements.push(<br key={`br-${key++}`} />);
    } else {
      elements.push(
        <p key={`p-${key++}`} style={{ margin: 0 }}>
          {parseInline(line)}
        </p>
      );
    }
  }

  return elements;
};
