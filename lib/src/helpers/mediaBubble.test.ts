import { describe, expect, it } from 'vitest';
import {
  getMediaBlockMode,
  partitionAttachments,
  usesMediaOverlayTime,
} from './mediaBubble';
import { IAttachment } from '../types/types';

const img = (name: string): IAttachment => ({
  location: `https://files.example/${name}`,
  mimetype: 'image/png',
  originalName: name,
});
const gif = (name: string): IAttachment => ({
  location: `https://files.example/${name}`,
  mimetype: 'image/gif',
  originalName: name,
});
const vid = (name: string): IAttachment => ({
  location: `https://files.example/${name}`,
  mimetype: 'video/mp4',
  originalName: name,
});
const svg: IAttachment = {
  location: 'https://files.example/logo.svg',
  mimetype: 'image/svg+xml',
  originalName: 'logo.svg',
};
const pdf: IAttachment = {
  location: 'https://files.example/doc.pdf',
  mimetype: 'application/pdf',
  originalName: 'doc.pdf',
};
const voice: IAttachment = {
  location: 'https://files.example/v.ogg',
  mimetype: 'audio/ogg',
  originalName: 'v.ogg',
};

const names = (items: { attachment: IAttachment }[]) =>
  items.map(({ attachment }) => attachment.originalName);

describe('partitionAttachments', () => {
  it('puts every picture and video into the album, in picked order, ahead of files', () => {
    // Selection: svg, picture, pdf, video, picture
    const { tiles, rows } = partitionAttachments([svg, img('a.png'), pdf, vid('v.mp4'), img('b.png')]);
    expect(names(tiles)).toEqual(['a.png', 'v.mp4', 'b.png']);
    expect(names(rows)).toEqual(['logo.svg', 'doc.pdf']);
  });

  it('keeps the picked order of the files below the album', () => {
    const { rows } = partitionAttachments([pdf, img('a.png'), svg, img('b.png')]);
    expect(names(rows)).toEqual(['doc.pdf', 'logo.svg']);
  });

  it('keeps a lone picture as a row, but puts it before the files', () => {
    const { tiles, rows } = partitionAttachments([pdf, img('a.png'), svg]);
    expect(tiles).toEqual([]);
    expect(names(rows)).toEqual(['a.png', 'doc.pdf', 'logo.svg']);
  });

  it('leaves voice notes among the rows in their picked order', () => {
    const { rows } = partitionAttachments([voice, pdf]);
    expect(names(rows)).toEqual(['v.ogg', 'doc.pdf']);
  });
});

describe('getMediaBlockMode', () => {
  it('is an album for two or more pictures or videos', () => {
    expect(getMediaBlockMode([img('a.png'), vid('b.mp4')])).toBe('album');
  });

  it('is solo for one picture or video, cards or not', () => {
    expect(getMediaBlockMode([gif('a.gif')])).toBe('solo');
    expect(getMediaBlockMode([pdf, img('a.png')])).toBe('solo');
  });

  it('is files for documents only, and plain for voice notes only', () => {
    expect(getMediaBlockMode([pdf, svg])).toBe('files');
    expect(getMediaBlockMode([voice])).toBe('plain');
  });
});

describe('usesMediaOverlayTime', () => {
  it('overlays a media-only solo or album bubble', () => {
    expect(usesMediaOverlayTime([gif('a.gif')])).toBe(true);
    expect(usesMediaOverlayTime([img('a.png'), vid('b.mp4')])).toBe(true);
  });

  it('uses the bottom row when there are cards, audio or a caption', () => {
    expect(usesMediaOverlayTime([img('a.png'), pdf])).toBe(false);
    expect(usesMediaOverlayTime([voice])).toBe(false);
    expect(usesMediaOverlayTime([img('a.png')], { hasCaption: true })).toBe(false);
    expect(usesMediaOverlayTime([])).toBe(false);
  });
});
