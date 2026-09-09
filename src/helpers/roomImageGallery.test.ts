import { describe, expect, it } from 'vitest';
import { collectRoomImages, findGalleryIndex } from './roomImageGallery';
import { IMessage } from '../types/types';

const message = (overrides: Partial<IMessage>): IMessage =>
  ({
    id: 'm1',
    body: '',
    roomJid: 'room@conference.xmpp.example.com',
    date: '2026-01-01T00:00:00.000Z',
    user: { id: 'u1' },
    ...overrides,
  }) as unknown as IMessage;

describe('collectRoomImages', () => {
  it('returns the images of the loaded messages in chronological order', () => {
    const images = collectRoomImages([
      message({
        id: 'a',
        location: 'https://files.example.com/one.png',
        mimetype: 'image/png',
        originalName: 'one.png',
      }),
      message({ id: 'b', body: 'just text' }),
      message({
        id: 'c',
        location: 'https://files.example.com/two.jpg',
        mimetype: 'image/jpeg',
        originalName: 'two.jpg',
      }),
    ]);

    expect(images.map((image) => image.fileURL)).toEqual([
      'https://files.example.com/one.png',
      'https://files.example.com/two.jpg',
    ]);
    expect(images[0].fileName).toBe('one.png');
    expect(images[0].mimetype).toBe('image/png');
  });

  it('flattens a multi-attachment message into one entry per image', () => {
    const images = collectRoomImages([
      message({
        id: 'multi',
        attachments: [
          {
            location: 'https://files.example.com/a.png',
            mimetype: 'image/png',
            originalName: 'a.png',
          },
          {
            location: 'https://files.example.com/report.pdf',
            mimetype: 'application/pdf',
            originalName: 'report.pdf',
          },
          {
            location: 'https://files.example.com/b.png',
            mimetype: 'image/png',
            originalName: 'b.png',
          },
        ],
      } as Partial<IMessage>),
    ]);

    expect(images.map((image) => image.fileName)).toEqual(['a.png', 'b.png']);
    // Keys stay unique per slot, so two identical pictures are two entries.
    expect(new Set(images.map((image) => image.key)).size).toBe(2);
  });

  it('skips non-images so a PDF or video never joins the gallery', () => {
    const images = collectRoomImages([
      message({
        id: 'pdf',
        location: 'https://files.example.com/report.pdf',
        mimetype: 'application/pdf',
        originalName: 'report.pdf',
      }),
      message({
        id: 'video',
        location: 'https://files.example.com/clip.mp4',
        mimetype: 'video/mp4',
        originalName: 'clip.mp4',
      }),
      message({
        id: 'voice',
        location: 'https://files.example.com/voice.bin',
        mimetype: 'application/octet-stream',
        originalName: 'voice',
      }),
    ]);

    expect(images).toEqual([]);
  });

  it('skips deleted messages, the unread delimiter and pending uploads', () => {
    const images = collectRoomImages([
      message({
        id: 'deleted',
        isDeleted: true,
        location: 'https://files.example.com/gone.png',
        mimetype: 'image/png',
      }),
      message({ id: 'delimiter-new' }),
      message({
        id: 'uploading',
        attachments: [{ location: '', mimetype: 'image/png', originalName: 'x.png' }],
      } as Partial<IMessage>),
      message({
        id: 'ok',
        location: 'https://files.example.com/here.png',
        mimetype: 'image/png',
      }),
    ]);

    expect(images.map((image) => image.fileURL)).toEqual([
      'https://files.example.com/here.png',
    ]);
  });

  it('is empty for missing or non-array input', () => {
    expect(collectRoomImages(undefined)).toEqual([]);
    expect(collectRoomImages(null)).toEqual([]);
  });
});

describe('findGalleryIndex', () => {
  const images = collectRoomImages([
    message({
      id: 'a',
      location: 'https://files.example.com/one.png',
      mimetype: 'image/png',
    }),
    message({
      id: 'b',
      location: 'https://files.example.com/two.png',
      mimetype: 'image/png',
    }),
  ]);

  it('locates the open file by URL', () => {
    expect(
      findGalleryIndex(images, {
        fileName: 'two.png',
        fileURL: 'https://files.example.com/two.png',
        mimetype: 'image/png',
      })
    ).toBe(1);
  });

  it('matches a secure URL that already carries a ?ft= token', () => {
    const secure = collectRoomImages([
      message({
        id: 'a',
        location: 'https://secure-files.example.com/a.jpg',
        mimetype: 'image/jpeg',
      }),
      message({
        id: 'b',
        location: 'https://secure-files.example.com/b.jpg',
        mimetype: 'image/jpeg',
      }),
    ]);

    // What a message bubble puts in the store for a secure room: the token
    // is minted per viewer and is not part of the file's identity.
    expect(
      findGalleryIndex(secure, {
        fileName: 'b.jpg',
        fileURL: 'https://secure-files.example.com/b.jpg?ft=some-token',
        mimetype: 'image/jpeg',
      })
    ).toBe(1);
  });

  it('returns -1 for a file that is not part of the gallery', () => {
    expect(
      findGalleryIndex(images, {
        fileName: 'report.pdf',
        fileURL: 'https://files.example.com/report.pdf',
        mimetype: 'application/pdf',
      })
    ).toBe(-1);
    expect(findGalleryIndex(images, undefined)).toBe(-1);
  });
});
