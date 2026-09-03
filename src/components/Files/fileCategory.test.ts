import { describe, expect, it } from 'vitest';
import { getFileCategory, formatBytes, isPreviewable } from './fileCategory';

describe('getFileCategory', () => {
  it('classifies images and videos as media', () => {
    expect(getFileCategory('image/png')).toBe('media');
    expect(getFileCategory('video/mp4')).toBe('media');
  });

  it('classifies audio', () => {
    expect(getFileCategory('audio/mpeg')).toBe('audio');
  });

  it('falls back to documents for anything else', () => {
    expect(getFileCategory('application/pdf')).toBe('documents');
    expect(getFileCategory('text/plain')).toBe('documents');
    expect(getFileCategory(undefined)).toBe('documents');
  });

  it('is case-insensitive', () => {
    expect(getFileCategory('IMAGE/PNG')).toBe('media');
  });
});

describe('isPreviewable', () => {
  it('treats images, video and pdf as previewable', () => {
    expect(isPreviewable({ mimetype: 'image/png' })).toBe(true);
    expect(isPreviewable({ mimetype: 'video/mp4' })).toBe(true);
    expect(isPreviewable({ mimetype: 'application/pdf' })).toBe(true);
  });

  it('treats other documents as not previewable', () => {
    expect(isPreviewable({ mimetype: 'application/zip' })).toBe(false);
    expect(isPreviewable({ mimetype: undefined })).toBe(false);
  });
});

describe('formatBytes', () => {
  it('formats zero/undefined as 0 B', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(undefined)).toBe('0 B');
    expect(formatBytes(null)).toBe('0 B');
  });

  it('formats bytes below 1KB without decimals', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes with one decimal', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes and gigabytes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
  });
});
