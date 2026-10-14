import { describe, expect, it } from 'vitest';
import { getMessageCaption, normalizeCaptionInput, normalizeCaptionMentions } from './caption';
import { createMainMessageForThread } from './createMainMessageForThread';

describe('normalizeCaptionInput', () => {
  it('returns nothing for blank text, so no caption is sent', () => {
    expect(normalizeCaptionInput({ text: '   \n ' })).toBeUndefined();
    expect(normalizeCaptionInput(undefined)).toBeUndefined();
  });

  it('keeps valid mention spans and drops stale ones', () => {
    const result = normalizeCaptionInput({
      text: 'hey @Alice',
      mentions: [
        { jid: 'a@x', name: 'Alice', offset: 4, length: 6 },
        { jid: 'b@x', name: 'Bob', offset: 0, length: 4 },
      ],
    });
    expect(result?.caption).toBe('hey @Alice');
    expect(result?.mentions).toEqual([{ jid: 'a@x', name: 'Alice', offset: 4, length: 6 }]);
  });

  it('omits the mentions key when no span survives', () => {
    const result = normalizeCaptionInput({ text: 'plain' });
    expect(result).toEqual({ caption: 'plain' });
  });
});

describe('normalizeCaptionMentions', () => {
  it('accepts a JSON string, as it arrives on the wire', () => {
    const json = JSON.stringify([{ jid: 'a@x', name: 'Alice', offset: 0, length: 6 }]);
    expect(normalizeCaptionMentions(json, '@Alice hi')).toEqual([
      { jid: 'a@x', name: 'Alice', offset: 0, length: 6 },
    ]);
  });

  it('ignores junk rather than throwing', () => {
    expect(normalizeCaptionMentions('not json', 'x')).toBeUndefined();
    expect(normalizeCaptionMentions([{ jid: 1 }], 'x')).toBeUndefined();
  });
});

describe('getMessageCaption', () => {
  it('returns the caption, or undefined for none or blank', () => {
    expect(getMessageCaption({ caption: 'hi' })).toBe('hi');
    expect(getMessageCaption({ caption: '  ' })).toBeUndefined();
    expect(getMessageCaption({})).toBeUndefined();
    expect(getMessageCaption(null)).toBeUndefined();
  });
});

describe('createMainMessageForThread for a media message', () => {
  const base = {
    id: 'm1',
    body: 'media',
    date: '2026-01-01T00:00:00.000Z',
    roomJid: 'room@conference.x',
    user: { name: 'Ada' },
    location: 'https://files.example.com/a.png',
    mimetype: 'image/png',
  } as never;

  it('quotes the caption when there is one', () => {
    const data = JSON.parse(createMainMessageForThread({ ...base, caption: 'look' }));
    expect(data.text).toBe('look');
  });

  it('keeps the old body text when there is no caption', () => {
    const data = JSON.parse(createMainMessageForThread(base));
    expect(data.text).toBe('media');
  });

  it('never quotes a sealed caption into a reply stanza', () => {
    const data = JSON.parse(
      createMainMessageForThread({ ...base, caption: 'secret', clientEncrypted: 'true' })
    );
    expect(data.text).toBe('media');
    expect(JSON.stringify(data)).not.toContain('secret');
  });
});
