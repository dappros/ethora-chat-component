import { describe, expect, it } from 'vitest';
import { safeImageUrl } from './safeUrl';

describe('safeImageUrl', () => {
  it.each([
    ['https://cdn.example.com/a.png'],
    ['http://example.com/a.jpg'],
    ['https://secure-files.example.com/f/1?ft=token'],
    ['blob:https://app.example.com/0f3c-uuid'],
    ['/avatars/me.png'],
    ['avatars/me.png'],
    ['//cdn.example.com/a.webp'],
    ['data:image/png;base64,iVBORw0KGgo='],
    ['data:image/jpeg;base64,/9j/4AAQ='],
    ['data:image/JPG;base64,/9j/4AAQ='],
    ['data:image/gif;base64,R0lGOD=='],
    ['data:image/webp;base64,UklGRg=='],
    ['data:image/avif;base64,AAAAIGZ0eXA='],
  ])('keeps the allowed image URL %s', (url) => {
    expect(safeImageUrl(url)).toBe(url);
  });

  it('trims surrounding whitespace from an allowed URL', () => {
    expect(safeImageUrl('  https://cdn.example.com/a.png \n')).toBe(
      'https://cdn.example.com/a.png'
    );
  });

  it.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(1)'],
    ['  javascript:alert(1)'],
    ['java\tscript:alert(1)'],
    ['vbscript:msgbox(1)'],
    ['data:text/html;base64,PHNjcmlwdD4='],
    ['data:image/svg+xml;base64,PHN2Zz4='],
    ['data:image/svg+xml,<svg onload=alert(1)>'],
    ['data:application/javascript,alert(1)'],
    ['data:image/png,notbase64'],
    ['file:///etc/passwd'],
    ['ftp://example.com/a.png'],
    ['https://'],
    ['http://[::1'],
  ])('blocks the unsafe or malformed URL %s', (url) => {
    expect(safeImageUrl(url)).toBe('');
  });

  it('returns empty for empty and whitespace-only strings', () => {
    expect(safeImageUrl('')).toBe('');
    expect(safeImageUrl('   ')).toBe('');
  });

  it.each([[undefined], [null], [42], [{ src: 'https://a.com/x.png' }], [['https://a.com/x.png']], [true]])(
    'returns empty for non-string input %p',
    (value) => {
      expect(safeImageUrl(value)).toBe('');
    }
  );
});
