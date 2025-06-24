import React from 'react';

export const parseMessageBody = (text: string): (string | JSX.Element)[] => {
  if (typeof text !== 'string') return [text];

  let key = 0;
  const elements: (string | JSX.Element)[] = [];
  const lines = text.split('\n');

  let inCodeBlock = false;
  const codeBuffer: string[] = [];

  const parseInline = (input: string): (string | JSX.Element)[] => {
    const stack: { type: string; content: (string | JSX.Element)[] }[] = [];
    const output: (string | JSX.Element)[] = [];

    let i = 0;

    const flushText = (text: string) => {
      const urlRegex =
        /(https:\/\/[\w.-]+(?:\.[\w.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+)/g;
      let lastIndex = 0;
      let match;
      while ((match = urlRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          output.push(text.slice(lastIndex, match.index));
        }
        output.push(
          <a
            key={`link-${key++}`}
            href={match[0]}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'blue', textDecoration: 'underline' }}
          >
            {match[0]}
          </a>
        );
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < text.length) {
        output.push(text.slice(lastIndex));
      }
    };

    while (i < input.length) {
      if (input.slice(i, i + 2) === '**') {
        if (stack.length && stack[stack.length - 1].type === 'bold') {
          const bold = stack.pop()!;
          output.push(<strong key={`b-${key++}`}>{bold.content}</strong>);
        } else {
          stack.push({ type: 'bold', content: [] });
        }
        i += 2;
      } else if (input[i] === '*' && (i === 0 || input[i - 1] !== '*')) {
        if (stack.length && stack[stack.length - 1].type === 'italic') {
          const italic = stack.pop()!;
          output.push(<em key={`i-${key++}`}>{italic.content}</em>);
        } else {
          stack.push({ type: 'italic', content: [] });
        }
        i++;
      } else if (input.slice(i, i + 2) === '~~') {
        if (stack.length && stack[stack.length - 1].type === 'strike') {
          const strike = stack.pop()!;
          output.push(<del key={`s-${key++}`}>{strike.content}</del>);
        } else {
          stack.push({ type: 'strike', content: [] });
        }
        i += 2;
      } else if (input[i] === '`') {
        const end = input.indexOf('`', i + 1);
        if (end !== -1) {
          const codeText = input.slice(i + 1, end);
          output.push(
            <code
              key={`code-${key++}`}
              style={{
                background: '#eee',
                padding: '1px 4px',
                borderRadius: '4px',
              }}
            >
              {codeText}
            </code>
          );
          i = end + 1;
        } else {
          output.push(input[i++]);
        }
      } else {
        if (stack.length) {
          stack[stack.length - 1].content.push(input[i]);
        } else {
          let j = i;
          while (
            j < input.length &&
            input[j] !== '*' &&
            input.slice(j, j + 2) !== '**' &&
            input.slice(j, j + 2) !== '~~' &&
            input[j] !== '`'
          ) {
            j++;
          }
          flushText(input.slice(i, j));
          i = j - 1;
        }
        i++;
      }
    }

    while (stack.length) {
      const unclosed = stack.shift()!;
      output.push(...unclosed.content);
    }

    return output;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    if (line.trim() === '```') {
      inCodeBlock = !inCodeBlock;

      if (!inCodeBlock) {
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
            <code>{codeBuffer.join('\n')}</code>
          </pre>
        );
        codeBuffer.length = 0;
      }

      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line.replace(/\t/g, '    '));
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
    } else if (line.trim() === '') {
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
