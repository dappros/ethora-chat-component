import React from 'react';

let elementKeyCounter = 0;

export const decodeHTMLEntities = (text) => {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&hellip;': '…',
    '&#8209;': '-',
  };

  return text.replace(/&[a-zA-Z0-9#]+;/g, (match) => entities[match] || match);
};

const parseInline = (txt) => {
  const elements = [];
  let remaining = decodeHTMLEntities(txt);

  const pattern = /(\*\*\*|\*\*|\*|`)(.*?)\1/;

  while (remaining.length > 0) {
    const match = remaining.match(pattern);

    if (!match) {
      elements.push(remaining);
      break;
    }

    const fullMatch = match[0];
    const matchIndex = match.index;
    const delimiter = match[1];

    if (matchIndex > 0) {
      elements.push(remaining.substring(0, matchIndex));
    }

    let element = null;
    let content = match[2];

    if (delimiter === '`') {
      element = (
        <code
          key={`code-${elementKeyCounter++}`}
          style={{
            backgroundColor: '#f1f3f4',
            padding: '2px 4px',
            borderRadius: '3px',
            fontFamily: 'monospace',
            fontSize: '0.9em',
          }}
        >
          {content}
        </code>
      );
    } else if (delimiter === '***') {
      element = (
        <strong
          key={`bi-${elementKeyCounter++}`}
          style={{ fontWeight: 'bold' }}
        >
          <em key={`i-${elementKeyCounter++}`} style={{ fontStyle: 'italic' }}>
            {parseInline(content)}
          </em>
        </strong>
      );
    } else if (delimiter === '**') {
      element = (
        <strong key={`b-${elementKeyCounter++}`} style={{ fontWeight: 'bold' }}>
          {parseInline(content)}
        </strong>
      );
    } else if (delimiter === '*') {
      element = (
        <em key={`i-${elementKeyCounter++}`} style={{ fontStyle: 'italic' }}>
          {parseInline(content)}
        </em>
      );
    }

    if (element) {
      elements.push(element);
      remaining = remaining.substring(matchIndex + fullMatch.length);
    } else {
      elements.push(fullMatch);
      remaining = remaining.substring(matchIndex + fullMatch.length);
    }
  }

  return elements;
};

const isTableSeparatorLine = (line) => {
  const trimmed = line.trim();
  return (
    /^\|?[\s]*[\-\:]+[\s\|\-\:]*\|?[\s]*$/.test(trimmed) &&
    trimmed.includes('-')
  );
};

const parseTableRow = (line) => {
  const decodedLine = decodeHTMLEntities(line.trim()).replace(/\u00A0/g, ' ');

  const cleanedLine = decodedLine.replace(/^\||\|$/g, '');

  const cells = cleanedLine
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, '|').trim());
  return cells.length > 0 ? cells : [''];
};

export const parseMessageBody = (text) => {
  const lines = text.split('\n');
  const elements = [];
  elementKeyCounter = 0;

  let listBuffer = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeLines = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;

    const renderListItems = (items, depth) => {
      const result = [];
      let i = 0;

      while (i < items.length) {
        const item = items[i];

        if (item.depth === depth) {
          const subItems = [];
          let j = i + 1;
          while (j < items.length && items[j].depth > depth) {
            subItems.push(items[j]);
            j++;
          }

          const nestedList =
            subItems.length > 0 ? renderListItems(subItems, depth + 1) : null;

          let listItemContent;
          if (item.type === 'checkbox') {
            listItemContent = (
              <>
                <input
                  type="checkbox"
                  checked={item.checked}
                  readOnly
                  style={{ marginRight: '8px', verticalAlign: 'middle' }}
                />
                {parseInline(item.content)}
              </>
            );
          } else {
            listItemContent = parseInline(item.content);
          }

          result.push(
            <li
              key={`li-${elementKeyCounter++}`}
              style={{ marginBottom: '6px', lineHeight: '1.5' }}
            >
              {listItemContent}
              {nestedList}
            </li>
          );

          i = j;
        } else {
          i++;
        }
      }
      return result;
    };

    let i = 0;
    while (i < listBuffer.length) {
      const item = listBuffer[i];
      if (item.depth === 0) {
        const currentListType = item.type;
        const currentListItems = [];
        let j = i;

        while (j < listBuffer.length) {
          if (
            listBuffer[j].depth === 0 &&
            j > i &&
            listBuffer[j].type !== currentListType
          ) {
            break;
          }
          currentListItems.push(listBuffer[j]);
          j++;
        }

        const listContent = renderListItems(currentListItems, 0);
        const ListTag = currentListType === 'ol' ? 'ol' : 'ul';

        elements.push(
          <ListTag
            key={`${currentListType}-${elementKeyCounter++}`}
            style={{ margin: '12px 0', paddingLeft: '24px' }}
          >
            {listContent}
          </ListTag>
        );

        i = j;
      } else {
        i++;
      }
    }

    listBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('```')) {
      flushList();
      inCodeBlock = !inCodeBlock;
      if (!inCodeBlock) {
        elements.push(
          <pre
            key={`pre-${elementKeyCounter++}`}
            style={{
              backgroundColor: '#f6f8fa',
              padding: '12px',
              overflowX: 'auto',
              borderRadius: '6px',
              border: '1px solid #e1e4e8',
              fontSize: '14px',
              lineHeight: '1.45',
            }}
          >
            <code className={`language-${codeLang}`}>
              {codeLines.join('\n')}
            </code>
          </pre>
        );
        codeLang = '';
      } else {
        codeLang = trimmedLine.slice(3).trim();
        codeLines = [];
      }
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const headingStyles = {
        1: {
          fontSize: '2em',
          fontWeight: 'bold',
          marginBottom: '16px',
          marginTop: '24px',
        },
        2: {
          fontSize: '1.5em',
          fontWeight: 'bold',
          marginBottom: '14px',
          marginTop: '20px',
        },
        3: {
          fontSize: '1.25em',
          fontWeight: 'bold',
          marginBottom: '12px',
          marginTop: '16px',
        },
        4: {
          fontSize: '1.1em',
          fontWeight: 'bold',
          marginBottom: '10px',
          marginTop: '14px',
        },
        5: {
          fontSize: '1em',
          fontWeight: 'bold',
          marginBottom: '8px',
          marginTop: '12px',
        },
        6: {
          fontSize: '0.9em',
          fontWeight: 'bold',
          marginBottom: '8px',
          marginTop: '12px',
        },
      };

      elements.push(
        React.createElement(
          `h${level}`,
          { key: `h-${elementKeyCounter++}`, style: headingStyles[level] },
          parseInline(content)
        )
      );
      continue;
    }

    if (/^(\*|\-|\_){3,}$/.test(trimmedLine)) {
      flushList();
      elements.push(
        <hr
          key={`hr-${elementKeyCounter++}`}
          style={{
            margin: '20px 0',
            border: 'none',
            borderTop: '1px solid #e1e4e8',
          }}
        />
      );
      continue;
    }

    if (
      trimmedLine.includes('|') &&
      trimmedLine !== '' &&
      !isTableSeparatorLine(trimmedLine) &&
      !trimmedLine.match(/^\s*-?\s*\[[\sxX]\]/)
    ) {
      let separatorIndex = i + 1;
      while (
        separatorIndex < lines.length &&
        lines[separatorIndex].trim() === ''
      ) {
        separatorIndex++;
      }
      if (
        separatorIndex < lines.length &&
        isTableSeparatorLine(lines[separatorIndex].trim())
      ) {
        flushList();

        const rows = [];
        let headerCount = 0;

        const headers = parseTableRow(trimmedLine);
        headerCount = headers.length;
        rows.push(headers);

        let currentRowIndex = separatorIndex + 1;

        while (currentRowIndex < lines.length) {
          const nextLine = lines[currentRowIndex];
          const nextLineTrimmed = nextLine.trim();

          if (nextLineTrimmed === '') {
            currentRowIndex++;
            continue;
          }

          if (
            nextLineTrimmed.includes('|') &&
            !isTableSeparatorLine(nextLineTrimmed) &&
            !nextLineTrimmed.match(/^\s*-?\s*\[[\sxX]\]/)
          ) {
            let rowCells = parseTableRow(nextLineTrimmed);

            while (rowCells.length < headerCount) {
              rowCells.push('');
            }
            rowCells = rowCells.slice(0, headerCount);

            rows.push(rowCells);
            currentRowIndex++;
          } else {
            break;
          }
        }

        const dataRows = rows.slice(1);

        elements.push(
          <div
            key={`table-wrapper-${elementKeyCounter++}`}
            style={{ overflowX: 'auto', margin: '16px 0' }}
          >
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                minWidth: '600px',
                fontSize: '14px',
                border: '1px solid #d0d7de',
              }}
            >
              <thead>
                <tr>
                  {headers.map((h, idx) => (
                    <th
                      key={`th-${elementKeyCounter++}-${idx}`}
                      style={{
                        border: '1px solid #d0d7de',
                        padding: '12px 16px',
                        background: '#f6f8fa',
                        textAlign: 'left',
                        fontWeight: '600',
                        lineHeight: '1.5',
                      }}
                    >
                      {parseInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, rIdx) => (
                  <tr
                    key={`tr-${elementKeyCounter++}-${rIdx}`}
                    style={{
                      backgroundColor: rIdx % 2 === 0 ? '#ffffff' : '#f6f8fa',
                    }}
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={`td-${elementKeyCounter++}-${cIdx}`}
                        style={{
                          border: '1px solid #d0d7de',
                          padding: '12px 16px',
                          verticalAlign: 'top',
                          lineHeight: '1.5',
                        }}
                      >
                        {parseInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

        i = currentRowIndex - 1;
        continue;
      }
    }

    const listMatch = line.match(/^(\s*)(?:-|\*|\+)?\s*(\[[\sxX]\])\s*(.*)/);

    if (listMatch) {
      const leadingSpace = listMatch[1];
      const checkboxPart = listMatch[2];
      const content = listMatch[3];
      const depth = Math.floor(leadingSpace.length / 2);

      if (checkboxPart) {
        const checked = checkboxPart.toLowerCase() === '[x]';
        listBuffer.push({
          type: 'checkbox',
          content: decodeHTMLEntities(content),
          depth,
          checked,
        });
      } else {
        listBuffer.push({
          type: 'ul',
          content: content,
          depth,
        });
      }
      continue;
    }

    if (trimmedLine !== '') {
      flushList();
      elements.push(
        <p
          key={`p-${elementKeyCounter++}`}
          style={{
            margin: '12px 0',
            lineHeight: '1.6',
            color: '#24292f',
          }}
        >
          {parseInline(trimmedLine)}
        </p>
      );
    } else {
      flushList();
    }
  }

  flushList();

  return (
    <div
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {elements}
    </div>
  );
};

export default parseMessageBody;
