import { describe, it, expect } from 'vitest';
import { parseQuickReplies } from './quickReplies';

describe('parseQuickReplies', () => {
  it('decodes the {name, value} JSON the existing bots emit', () => {
    expect(
      parseQuickReplies('[{"name":"Create an NFT Item","value":"Create an NFT Item"}]')
    ).toEqual([{ name: 'Create an NFT Item', value: 'Create an NFT Item', questionId: undefined }]);
  });

  it('accepts an already-decoded array (getDataFromXml decodes in place)', () => {
    expect(parseQuickReplies([{ name: 'Yes', value: 'y', questionId: 'q1' }])).toEqual([
      { name: 'Yes', value: 'y', questionId: 'q1' },
    ]);
  });

  it('treats a bare string as both label and value', () => {
    expect(parseQuickReplies('["Yes","No"]')).toEqual([
      { name: 'Yes', value: 'Yes' },
      { name: 'No', value: 'No' },
    ]);
  });

  // The attribute is written by bots and (soon) by an LLM, so anything
  // malformed has to degrade to "no buttons" rather than break the message.
  it.each([
    ['empty string', ''],
    ['whitespace', '   '],
    ['broken JSON', '[{"name":'],
    ['not an array', '{"name":"Yes"}'],
    ['undefined', undefined],
    ['null', null],
  ])('returns no buttons for %s', (_label, input) => {
    expect(parseQuickReplies(input)).toEqual([]);
  });

  it('drops entries missing a usable label', () => {
    expect(parseQuickReplies('[{"value":"y"},{"name":"Ok","value":"ok"},null,42]')).toEqual([
      { name: 'Ok', value: 'ok', questionId: undefined },
    ]);
  });

  it('falls back to the label when a button carries no value', () => {
    expect(parseQuickReplies('[{"name":"Book a call"}]')).toEqual([
      { name: 'Book a call', value: 'Book a call', questionId: undefined },
    ]);
  });
});
