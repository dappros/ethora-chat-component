import { describe, expect, it } from 'vitest';
import {
  looksLikeRawRoomName,
  safeCallName,
  sanitizeCallName,
  sanitizeXmppUsername,
} from './callDisplay';

const A = '69c24e911e53d44d2b6c4bbc';
const U1 = `${A}_69c2517a239cee5defaf52d6`;
const U2 = `${A}_69c251a0239cee5defaf5343`;

describe('looksLikeRawRoomName', () => {
  it('flags a private chat name (two user JIDs joined)', () => {
    expect(looksLikeRawRoomName(`${U1}-${U2}`)).toBe(true);
    expect(looksLikeRawRoomName(`  ${U1}-${U2}  `)).toBe(true);
    expect(looksLikeRawRoomName(`${U1}-${U2}`.toUpperCase())).toBe(true);
    expect(looksLikeRawRoomName(`${U1}@xmpp.example.com-${U2}@xmpp.example.com`)).toBe(true);
  });

  it('flags a lone user id and an appId_uuid group name', () => {
    expect(looksLikeRawRoomName(U1)).toBe(true);
    expect(
      looksLikeRawRoomName(`${A}_0b6f3a52-7c1e-4d1c-9a3e-1f2b3c4d5e6f`)
    ).toBe(true);
  });

  it('flags a long opaque hex id', () => {
    expect(looksLikeRawRoomName('69c24e911e53d44d2b6c4bbc')).toBe(true);
  });

  it('does not flag real names, however odd', () => {
    for (const name of [
      'Roman Test',
      'Ada Lovelace',
      'Design team',
      'Bob B',
      'Zoë',
      'sales-room',
      'dead-beef',
      'Alice 2',
      '6',
      '',
      '   ',
    ]) {
      expect(looksLikeRawRoomName(name)).toBe(false);
    }
    expect(looksLikeRawRoomName(undefined)).toBe(false);
    expect(looksLikeRawRoomName(42)).toBe(false);
  });
});

describe('sanitizeCallName', () => {
  it('trims, collapses whitespace and keeps ordinary names', () => {
    expect(sanitizeCallName('  Ada   Lovelace ')).toBe('Ada Lovelace');
    expect(sanitizeCallName('Zoë 山田')).toBe('Zoë 山田');
  });

  it('strips control characters, bidi overrides and zero-width characters', () => {
    expect(sanitizeCallName('Ro\u0000man\u0007 Te\nst')).toBe('Ro man Te st');
    expect(sanitizeCallName('‮evil‬ name​')).toBe('evil name');
    expect(sanitizeCallName('\u0000\u001F ​')).toBe('');
  });

  it('caps at about 80 characters without cutting a surrogate pair', () => {
    expect(sanitizeCallName('x'.repeat(200)).length).toBe(80);
    const emoji = sanitizeCallName('😀'.repeat(200));
    expect(Array.from(emoji).length).toBe(80);
    expect(emoji.includes('�')).toBe(false);
  });

  it('is plain text: markup is left as characters, never interpreted', () => {
    expect(sanitizeCallName('<img src=x onerror=alert(1)>')).toBe(
      '<img src=x onerror=alert(1)>'
    );
  });

  it('refuses raw chat names and non-strings', () => {
    expect(sanitizeCallName(`${U1}-${U2}`)).toBe('');
    expect(sanitizeCallName(null)).toBe('');
    expect(sanitizeCallName({})).toBe('');
    expect(safeCallName(`${U1}-${U2}`)).toBeNull();
    expect(safeCallName(' Bob ')).toBe('Bob');
  });
});

describe('sanitizeXmppUsername', () => {
  it('accepts a user id, with or without domain, and rejects junk', () => {
    expect(sanitizeXmppUsername(U1)).toBe(U1);
    expect(sanitizeXmppUsername(`${U1}@xmpp.example.com/res`)).toBe(
      `${U1}@xmpp.example.com`
    );
    expect(sanitizeXmppUsername('a b')).toBeNull();
    expect(sanitizeXmppUsername('<x>')).toBeNull();
    expect(sanitizeXmppUsername('')).toBeNull();
    expect(sanitizeXmppUsername(undefined)).toBeNull();
    expect(sanitizeXmppUsername('x'.repeat(300))).toBeNull();
  });
});
