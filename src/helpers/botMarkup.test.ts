import { describe, it, expect } from 'vitest';
import { parseBotMarkup, stripBotMarkup } from './botMarkup';

const labels = (body: string) =>
  parseBotMarkup(body).buttons.map((button) => button.name);

describe('parseBotMarkup', () => {
  // The exact form the agent's system prompt teaches.
  it('reads the documented envelope: buttons from bot-data, text from body', () => {
    const result = parseBotMarkup(
      '<xml>\n<bot-data type="buttons">[Accept],[Reject]</bot-data>\n<body>Choose one please</body>\n</xml>'
    );

    expect(result.text).toBe('Choose one please');
    expect(result.buttons).toEqual([
      { name: 'Accept', value: 'Accept' },
      { name: 'Reject', value: 'Reject' },
    ]);
  });

  it('works without the <xml> wrapper or the <body> tag', () => {
    const result = parseBotMarkup(
      'Pick a time slot.\n<bot-data type="buttons">[Morning],[Afternoon]</bot-data>'
    );

    expect(result.text).toBe('Pick a time slot.');
    expect(labels('Pick.<bot-data type="buttons">[Morning],[Afternoon]</bot-data>')).toEqual([
      'Morning',
      'Afternoon',
    ]);
  });

  // Nothing the model wrote around the envelope may disappear.
  it('keeps text outside the envelope', () => {
    const result = parseBotMarkup(
      'Sure, happy to help.\n<xml><bot-data type="buttons">[Yes],[No]</bot-data><body>Is this your first visit?</body></xml>'
    );

    expect(result.text).toBe('Sure, happy to help.\nIs this your first visit?');
  });

  it('unwraps a fenced code block that carries the markup', () => {
    const result = parseBotMarkup(
      '```xml\n<xml>\n<bot-data type="buttons">[Accept],[Reject]</bot-data>\n<body>Choose one please</body>\n</xml>\n```'
    );

    expect(result.text).toBe('Choose one please');
    expect(result.buttons.map((b) => b.value)).toEqual(['Accept', 'Reject']);
  });

  it('accepts an HTML-escaped copy of the markup', () => {
    const result = parseBotMarkup(
      '&lt;bot-data type=&quot;buttons&quot;&gt;[Accept],[Reject]&lt;/bot-data&gt;&lt;body&gt;Choose one&lt;/body&gt;'
    );

    expect(result.text).toBe('Choose one');
    expect(result.buttons.map((b) => b.value)).toEqual(['Accept', 'Reject']);
  });

  it('allows commas inside a bracketed label', () => {
    expect(labels('<bot-data type="buttons">[Yes, book it],[No, thanks]</bot-data>')).toEqual([
      'Yes, book it',
      'No, thanks',
    ]);
  });

  it('falls back to a plain list when the model drops the brackets', () => {
    expect(labels('<bot-data type="buttons">Far, Near, Both</bot-data>')).toEqual([
      'Far',
      'Near',
      'Both',
    ]);
  });

  it('merges several blocks, drops duplicates and caps the count', () => {
    const many = Array.from({ length: 14 }, (_, i) => `[Option ${i + 1}]`).join(',');
    expect(labels(`<bot-data type="buttons">[A],[B]</bot-data><bot-data type="buttons">[B],[C]</bot-data>`)).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(labels(`<bot-data type="buttons">${many}</bot-data>`)).toHaveLength(10);
  });

  // Hiding content the client does not understand would be worse than
  // showing markup.
  it('leaves unknown bot-data types, and messages without markup, untouched', () => {
    const unknown = '<bot-data type="carousel">[x]</bot-data><body>Hi</body>';
    expect(parseBotMarkup(unknown)).toEqual({ text: unknown, buttons: [] });

    const html = 'Wrap it in <body> and <xml> tags, like this.';
    expect(parseBotMarkup(html)).toEqual({ text: html, buttons: [] });

    expect(parseBotMarkup(undefined)).toEqual({ text: '', buttons: [] });
  });

  it('strips an empty buttons block without inventing buttons', () => {
    expect(parseBotMarkup('<bot-data type="buttons"></bot-data><body>Hi</body>')).toEqual({
      text: 'Hi',
      buttons: [],
    });
  });

  it('stripBotMarkup returns the displayable text', () => {
    expect(
      stripBotMarkup('<xml><bot-data type="buttons">[A]</bot-data><body>Choose</body></xml>')
    ).toBe('Choose');
  });
});
