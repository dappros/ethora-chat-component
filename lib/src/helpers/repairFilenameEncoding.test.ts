import { describe, expect, it } from 'vitest';
import { repairFilenameEncoding } from './repairFilenameEncoding';

/** What multer hands over: UTF-8 bytes, each read as one Latin-1 char. */
const mojibake = (value: string): string =>
  Array.from(new TextEncoder().encode(value))
    .map((byte) => String.fromCharCode(byte))
    .join('');

describe('repairFilenameEncoding', () => {
  it.each([
    ['Cyrillic', 'Список рослин.pdf'],
    ['Ukrainian', 'Лікарські рослини (2).pdf'],
    ['Polish', 'Zażółć gęślą jaźń.pdf'],
    ['Chinese', '会议记录2026.pdf'],
    ['Arabic', 'ملف تجريبي.pdf'],
    ['accented Latin', 'Résumé café.pdf'],
  ])('repairs %s names', (_label, name) => {
    const broken = mojibake(name);
    expect(broken).not.toBe(name);
    expect(repairFilenameEncoding(broken)).toBe(name);
  });

  it('repairs the screenshot case', () => {
    expect(repairFilenameEncoding(mojibake('Список.pdf'))).toBe('Список.pdf');
  });

  it('repairs percent-encoded names', () => {
    expect(repairFilenameEncoding('%D0%A1%D0%BF%D0%B8%D1%81%D0%BE%D0%BA.pdf')).toBe(
      'Список.pdf'
    );
  });

  it('leaves correct names untouched', () => {
    [
      'Список.pdf',
      'Zażółć.pdf',
      '会议记录.pdf',
      'ملف.pdf',
      'plain.pdf',
      'résumé.pdf',
      '100%25 done.pdf',
      'report 50% final.pdf',
      '',
    ].forEach((name) => {
      expect(repairFilenameEncoding(name)).toBe(name);
    });
  });

  it('never repairs twice', () => {
    const once = repairFilenameEncoding(mojibake('Список.pdf'));
    expect(repairFilenameEncoding(once)).toBe(once);
  });

  it('does not repair names that would contain control characters', () => {
    // Byte repair would yield a C0 control character (U+0001).
    const raw = mojibake('Список\u0001.pdf');
    expect(repairFilenameEncoding(raw)).toBe(raw);
    // Percent-decoding would yield a C1 control character (U+009F).
    const encoded = '%D0%A1%C2%9F.pdf';
    expect(repairFilenameEncoding(encoded)).toBe(encoded);
    // Percent-decoding would yield DEL (U+007F).
    const del = '%D0%A1%7F.pdf';
    expect(repairFilenameEncoding(del)).toBe(del);
  });

  it('does not touch invalid byte sequences', () => {
    expect(repairFilenameEncoding('Ð.pdf')).toBe('Ð.pdf');
  });
});
