import { describe, expect, it } from 'vitest';
import { deriveMediaPreview, hasMediaPreview } from './lastMessagePreview';

const att = (extra: Record<string, unknown> = {}) => ({
  location: 'https://files.example.com/a.png',
  locationPreview: 'https://files.example.com/a-small.png',
  mimetype: 'image/png',
  originalName: 'a.png',
  ...extra,
});

describe('deriveMediaPreview', () => {
  it('is undefined for a plain text message', () => {
    expect(deriveMediaPreview({ body: 'hello' } as never)).toBeUndefined();
    expect(hasMediaPreview({ body: 'hello' } as never)).toBe(false);
  });

  it('reads a single image from `attachments` with no top level mimetype', () => {
    const p = deriveMediaPreview({ body: 'media', attachments: [att()] } as never);
    expect(p).toMatchObject({
      kind: 'image',
      count: 1,
      thumbUrl: 'https://files.example.com/a-small.png',
    });
    expect(p?.caption).toBeUndefined();
  });

  it('falls back to the full location when there is no preview', () => {
    const p = deriveMediaPreview({
      body: 'media',
      attachments: [att({ locationPreview: undefined })],
    } as never);
    expect(p?.thumbUrl).toBe('https://files.example.com/a.png');
  });

  it('counts several images', () => {
    const p = deriveMediaPreview({
      body: 'media',
      attachments: [att(), att({ location: 'https://files.example.com/b.png' })],
    } as never);
    expect(p).toMatchObject({ kind: 'image', count: 2 });
  });

  it('accepts the attachments as the raw JSON string from the stanza', () => {
    const p = deriveMediaPreview({
      body: 'media',
      isMediafile: 'true',
      attachments: JSON.stringify([att(), att()]),
    } as never);
    expect(p).toMatchObject({ kind: 'image', count: 2 });
  });

  it('treats a mixed album as files, not photos', () => {
    const p = deriveMediaPreview({
      body: 'media',
      attachments: [att(), att({ mimetype: 'video/mp4', originalName: 'v.mp4' })],
    } as never);
    expect(p).toMatchObject({ kind: 'file', count: 2 });
    expect(p?.thumbUrl).toBeUndefined();
  });

  it('video: poster only, never the video URL as an image', () => {
    const withPoster = deriveMediaPreview({
      body: 'media',
      attachments: [
        att({ mimetype: 'video/mp4', location: 'https://f/v.mp4', locationPreview: 'https://f/v.jpg' }),
      ],
    } as never);
    expect(withPoster).toMatchObject({ kind: 'video', thumbUrl: 'https://f/v.jpg' });

    const noPoster = deriveMediaPreview({
      body: 'media',
      attachments: [att({ mimetype: 'video/mp4', location: 'https://f/v.mp4', locationPreview: undefined })],
    } as never);
    expect(noPoster?.kind).toBe('video');
    expect(noPoster?.thumbUrl).toBeUndefined();
  });

  it('audio and voice, with duration when known', () => {
    const voice = deriveMediaPreview({
      body: 'media',
      mimetype: 'application/octet-stream',
      location: 'https://f/x',
      originalName: 'rec',
      attachments: [att({ mimetype: 'application/octet-stream', originalName: 'rec', duration: '12' })],
    } as never);
    expect(voice).toMatchObject({ kind: 'voice', durationText: '0:12' });

    const song = deriveMediaPreview({
      body: 'media',
      attachments: [att({ mimetype: 'audio/mpeg', originalName: 'song.mp3' })],
    } as never);
    expect(song?.kind).toBe('audio');
  });

  it('other files carry the file name', () => {
    const p = deriveMediaPreview({
      body: 'media',
      attachments: [att({ mimetype: 'application/pdf', originalName: 'report.pdf' })],
    } as never);
    expect(p).toMatchObject({ kind: 'file', fileName: 'report.pdf' });
  });

  it('a body other than the "media" placeholder is the caption', () => {
    const p = deriveMediaPreview({ body: 'Sunset', attachments: [att()] } as never);
    expect(p?.caption).toBe('Sunset');
  });

  it('e2ee: icon and label only, no thumbnail, no file name, no caption', () => {
    const image = deriveMediaPreview(
      { body: 'secret', attachments: [att()] } as never,
      { sealed: true }
    );
    expect(image?.kind).toBe('image');
    expect(image?.thumbUrl).toBeUndefined();
    expect(image?.caption).toBeUndefined();

    const file = deriveMediaPreview(
      { body: 'media', attachments: [att({ mimetype: 'application/pdf', originalName: 'tax.pdf' })] } as never,
      { sealed: true }
    );
    expect(file?.fileName).toBeUndefined();
  });

  it('clientEncrypted on the message also seals it', () => {
    const p = deriveMediaPreview({
      body: 'media',
      clientEncrypted: 'true',
      attachments: [att()],
    } as never);
    expect(p?.thumbUrl).toBeUndefined();
  });

  it('backend payload shape: flat mimetype and fileName, no attachments array', () => {
    const p = deriveMediaPreview({
      body: 'media',
      isMediafile: 'true',
      mimetype: 'image/jpeg',
      fileName: 'p.jpg',
      location: 'https://f/p.jpg',
    } as never);
    expect(p).toMatchObject({ kind: 'image', thumbUrl: 'https://f/p.jpg' });
  });

  it('backend payload with only the media flag still renders a row', () => {
    const p = deriveMediaPreview({ body: 'media', isMediafile: 'true' } as never);
    expect(p).toMatchObject({ kind: 'attachment', count: 1 });
  });

  it('stanza shape: legacy single file fields on the message', () => {
    const p = deriveMediaPreview({
      body: 'media',
      isMediafile: 'true',
      location: 'https://f/s.png',
      locationPreview: 'https://f/s-small.png',
      mimetype: 'image/png',
      originalName: 's.png',
    } as never);
    expect(p).toMatchObject({ kind: 'image', thumbUrl: 'https://f/s-small.png' });
  });

  it('a deleted media message is not a media preview', () => {
    expect(
      deriveMediaPreview({ body: 'media', isDeleted: true, attachments: [att()] } as never)
    ).toBeUndefined();
  });
});

describe('deriveMediaPreview with SVG', () => {
  it('shows an svg as a file, not a photo', () => {
    const p = deriveMediaPreview({
      body: 'media',
      attachments: [att({ mimetype: 'image/svg+xml', originalName: 'logo.svg' })],
    } as never);
    expect(p?.kind).toBe('file');
  });
});

describe('deriveMediaPreview with a caption', () => {
  it('uses the caption carried on the message', () => {
    const preview = deriveMediaPreview({
      body: 'media',
      isMediafile: 'true',
      caption: 'look at this',
      attachments: [att()],
    } as never);
    expect(preview?.caption).toBe('look at this');
    expect(preview?.kind).toBe('image');
  });

  it('shows the caption in a sealed row too, since it was read locally', () => {
    const preview = deriveMediaPreview(
      {
        body: 'media',
        isMediafile: 'true',
        clientEncrypted: 'true',
        caption: 'secret words',
        attachments: [att({ location: 'https://secure.example/x' })],
      } as never,
      { sealed: true }
    );
    // Sealed content gets no thumbnail, but the caption still reads.
    expect(preview?.thumbUrl).toBeUndefined();
    expect(preview?.caption).toBe('secret words');
  });

  it('has no caption when the message has none and the body is only the placeholder', () => {
    const preview = deriveMediaPreview({
      body: 'media',
      isMediafile: 'true',
      attachments: [att()],
    } as never);
    expect(preview?.caption).toBeUndefined();
  });
});
