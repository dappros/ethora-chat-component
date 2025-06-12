export const parseMessageBody = (text: string): (string | JSX.Element)[] => {
  if (typeof text !== 'string') return [text];

  const urlRegex =
    /(https:\/\/[\w.-]+(?:\.[\w.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: any;

  while ((match = urlRegex.exec(text)) !== null) {
    const index = match.index;
    const url = match[0];

    if (index > lastIndex) {
      parts.push(text.substring(lastIndex, index));
    }

    parts.push(
      <a
        key={index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'blue', textDecoration: 'underline' }}
      >
        {url}
      </a>
    );

    lastIndex = index + url.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  if (parts.length === 0 && lastIndex === 0) {
    return [text];
  }

  return parts;
};
