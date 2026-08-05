import { describe, expect, it } from 'vitest';
import {
  formatFileName,
  formatFileSize,
  getFileExtension,
  getFileKind,
  isPdfFile,
} from './fileKind';

describe('getFileKind', () => {
  it.each([
    ['image/png', 'shot.png', 'image'],
    ['image/jpeg', undefined, 'image'],
    ['video/mp4', 'clip.mp4', 'video'],
    ['audio/webm', 'note.webm', 'audio'],
    ['application/pdf', 'report.pdf', 'pdf'],
    ['application/zip', 'bundle.zip', 'file'],
    [undefined, 'notes.txt', 'file'],
  ] as const)('maps %s / %s to %s', (mimetype, name, expected) => {
    expect(getFileKind(mimetype, name)).toBe(expected);
  });

  // The storage tags anything it cannot sniff as octet-stream. That branch
  // belongs to voice notes, and it used to swallow every PDF with it -
  // documents rendered as a broken audio player.
  it('reads a .pdf named octet-stream as a PDF, not audio', () => {
    expect(getFileKind('application/octet-stream', 'contract.pdf')).toBe('pdf');
  });

  it('still reads a nameless octet-stream as audio', () => {
    expect(getFileKind('application/octet-stream', undefined)).toBe('audio');
  });

  it('is case-insensitive about the extension', () => {
    expect(getFileKind('application/octet-stream', 'CONTRACT.PDF')).toBe('pdf');
  });

  it('falls back to file when it knows nothing', () => {
    expect(getFileKind(undefined, undefined)).toBe('file');
  });
});

describe('isPdfFile', () => {
  it('accepts both the mime type and the extension', () => {
    expect(isPdfFile('application/pdf')).toBe(true);
    expect(isPdfFile('application/x-pdf')).toBe(true);
    expect(isPdfFile(undefined, 'a.pdf')).toBe(true);
    expect(isPdfFile('image/png', 'a.png')).toBe(false);
  });

  it('does not treat a leading dot as an extension', () => {
    expect(getFileExtension('.pdf')).toBe('');
  });
});

describe('formatFileSize', () => {
  it.each([
    ['0', '0 B'],
    ['512', '512 B'],
    ['2048', '2.00 KB'],
    [5 * 1024 * 1024, '5.00 MB'],
  ] as const)('formats %s as %s', (input, expected) => {
    expect(formatFileSize(input)).toBe(expected);
  });

  // Rendering the literal string "Invalid size" next to a file name is
  // worse than rendering nothing, and callers now skip the chip when empty.
  it('returns an empty string for anything unparseable', () => {
    expect(formatFileSize(undefined)).toBe('');
    expect(formatFileSize('')).toBe('');
    expect(formatFileSize('not-a-number')).toBe('');
  });
});

describe('formatFileName', () => {
  it('leaves short names alone', () => {
    expect(formatFileName('report.pdf', 20)).toBe('report.pdf');
  });

  it('truncates the base name but keeps the extension', () => {
    const result = formatFileName('a-very-long-document-name.pdf', 20);
    expect(result.endsWith('.pdf')).toBe(true);
    expect(result).toContain('...');
  });

  it('survives a name with no extension', () => {
    expect(formatFileName('README', 4)).toBe('R...');
  });
});
