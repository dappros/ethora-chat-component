import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  getAttachmentName,
  getMessageAttachments,
  normalizeAttachment,
  parseAttachments,
  serializeAttachments,
} from './attachments';
import { IAttachment } from '../types/types';

const attachment = (overrides: Partial<IAttachment> = {}): IAttachment => ({
  location: 'https://files.example/a.pdf',
  mimetype: 'application/pdf',
  originalName: 'a.pdf',
  size: '1024',
  ...overrides,
});

describe('normalizeAttachment', () => {
  it('accepts the API spelling of the name fields', () => {
    const result = normalizeAttachment({
      _id: 'abc',
      location: 'https://files.example/x.png',
      originalname: 'x.png',
      filename: 'stored-x.png',
    });

    expect(result).toMatchObject({
      attachmentId: 'abc',
      originalName: 'x.png',
      fileName: 'stored-x.png',
    });
  });

  // An optimistic attachment has no URL yet - it must survive so the bubble
  // can render a placeholder while the upload is in flight.
  it('keeps an entry that only has a name', () => {
    expect(normalizeAttachment({ originalName: 'pending.pdf' })).toMatchObject({
      location: '',
      originalName: 'pending.pdf',
    });
  });

  it('rejects entries with nothing renderable in them', () => {
    expect(normalizeAttachment({})).toBeNull();
    expect(normalizeAttachment(null)).toBeNull();
    expect(normalizeAttachment('nope')).toBeNull();
  });

  it('coerces the wire booleans', () => {
    expect(normalizeAttachment({ location: 'u', isPrivate: 'true' })).toMatchObject(
      { isPrivate: true }
    );
  });
});

describe('parseAttachments', () => {
  it('parses the JSON wire form', () => {
    const raw = serializeAttachments([attachment(), attachment({ originalName: 'b.pdf' })]);
    expect(parseAttachments(raw)).toHaveLength(2);
  });

  it('accepts an already-parsed array', () => {
    expect(parseAttachments([attachment()])).toHaveLength(1);
  });

  it('never throws on junk', () => {
    expect(parseAttachments('{not json')).toEqual([]);
    expect(parseAttachments(undefined)).toEqual([]);
    expect(parseAttachments(42)).toEqual([]);
    expect(parseAttachments('{"a":1}')).toEqual([]);
  });

  it('drops unrenderable entries instead of the whole payload', () => {
    expect(parseAttachments([attachment(), {}, null])).toHaveLength(1);
  });

  it('caps a hostile payload', () => {
    const many = Array.from({ length: 50 }, (_, index) =>
      attachment({ originalName: `${index}.pdf` })
    );
    expect(parseAttachments(many)).toHaveLength(MAX_ATTACHMENTS_PER_MESSAGE);
  });
});

describe('getMessageAttachments', () => {
  it('prefers the multi-attach payload', () => {
    const result = getMessageAttachments({
      attachments: [attachment(), attachment({ originalName: 'b.pdf' })],
      location: 'https://files.example/legacy.png',
      mimetype: 'image/png',
    });

    expect(result).toHaveLength(2);
    expect(result[0].originalName).toBe('a.pdf');
  });

  // Every message sent before this feature - and every message from a client
  // that does not speak it - takes this path.
  it('synthesises one attachment from the flat legacy fields', () => {
    const result = getMessageAttachments({
      location: 'https://files.example/legacy.png',
      locationPreview: 'https://files.example/legacy-thumb.png',
      mimetype: 'image/png',
      originalName: 'legacy.png',
      size: '2048',
    });

    expect(result).toEqual([
      expect.objectContaining({
        location: 'https://files.example/legacy.png',
        locationPreview: 'https://files.example/legacy-thumb.png',
        mimetype: 'image/png',
        originalName: 'legacy.png',
        size: '2048',
      }),
    ]);
  });

  it('falls back to the legacy fields when the payload is unusable', () => {
    const result = getMessageAttachments({
      attachments: '[]' as unknown as IAttachment[],
      location: 'https://files.example/legacy.png',
      mimetype: 'image/png',
    });

    expect(result).toHaveLength(1);
  });

  it('returns nothing for a message with no media at all', () => {
    expect(getMessageAttachments({})).toEqual([]);
    expect(getMessageAttachments(null)).toEqual([]);
  });
});

describe('serializeAttachments', () => {
  it('emits only the fields a receiver renders', () => {
    const [wire] = JSON.parse(
      serializeAttachments([
        attachment({ ownerKey: 'secret', userId: 'u1', isPrivate: true }),
      ])
    );

    expect(wire).not.toHaveProperty('ownerKey');
    expect(wire).not.toHaveProperty('userId');
    expect(wire).toMatchObject({ location: 'https://files.example/a.pdf' });
  });

  it('round-trips through parseAttachments', () => {
    const input = [attachment(), attachment({ originalName: 'b.png', mimetype: 'image/png' })];
    expect(parseAttachments(serializeAttachments(input))).toMatchObject([
      { originalName: 'a.pdf', mimetype: 'application/pdf' },
      { originalName: 'b.png', mimetype: 'image/png' },
    ]);
  });
});

describe('getAttachmentName', () => {
  it('walks originalName -> fileName -> URL tail -> placeholder', () => {
    expect(getAttachmentName(attachment())).toBe('a.pdf');
    expect(
      getAttachmentName(attachment({ originalName: undefined, fileName: 'stored.pdf' }))
    ).toBe('stored.pdf');
    expect(
      getAttachmentName(attachment({ originalName: undefined, fileName: undefined }))
    ).toBe('a.pdf');
    expect(getAttachmentName({ location: '' })).toBe('MediaFile');
  });
});
