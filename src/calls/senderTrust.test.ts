import { describe, expect, it } from 'vitest';
import { isSystemAccountSender } from './senderTrust';

const APP = '69c24e911e53d44d2b6c4bbc';
const SYSTEM = `${APP}_${APP}`;

describe('isSystemAccountSender', () => {
  it('accepts the system account, with or without a resource', () => {
    expect(isSystemAccountSender(`${SYSTEM}@xmpp.example.com`)).toBe(true);
    expect(isSystemAccountSender(`${SYSTEM}@xmpp.example.com/1234567`)).toBe(true);
    expect(isSystemAccountSender(`  ${SYSTEM}@xmpp.example.com/r  `)).toBe(true);
  });

  it('accepts uppercase hex as long as both halves are identical', () => {
    const up = APP.toUpperCase();
    expect(isSystemAccountSender(`${up}_${up}@xmpp.example.com`)).toBe(true);
    // Different case on the two halves is not "the same value twice".
    expect(isSystemAccountSender(`${up}_${APP}@xmpp.example.com`)).toBe(false);
  });

  it('rejects a normal user JID (appId_userId)', () => {
    expect(
      isSystemAccountSender(`${APP}_69c2517a239cee5defaf52d6@xmpp.example.com/r`)
    ).toBe(false);
    expect(isSystemAccountSender('alice@xmpp.example.com')).toBe(false);
  });

  it('rejects mismatched halves and wrong lengths', () => {
    const other = '69c24e911e53d44d2b6c4bbd';
    expect(isSystemAccountSender(`${APP}_${other}@xmpp.example.com`)).toBe(false);
    const short = APP.slice(0, 23);
    expect(isSystemAccountSender(`${short}_${short}@xmpp.example.com`)).toBe(false);
    const long = `${APP}0`;
    expect(isSystemAccountSender(`${long}_${long}@xmpp.example.com`)).toBe(false);
    expect(isSystemAccountSender(`${APP}${APP}@xmpp.example.com`)).toBe(false);
    expect(isSystemAccountSender(`${SYSTEM}_x@xmpp.example.com`)).toBe(false);
  });

  it('rejects non-hex characters', () => {
    const bad = 'g9c24e911e53d44d2b6c4bbc';
    expect(isSystemAccountSender(`${bad}_${bad}@xmpp.example.com`)).toBe(false);
  });

  it('rejects a missing, empty or malformed from', () => {
    expect(isSystemAccountSender(undefined)).toBe(false);
    expect(isSystemAccountSender(null)).toBe(false);
    expect(isSystemAccountSender('')).toBe(false);
    expect(isSystemAccountSender('   ')).toBe(false);
    expect(isSystemAccountSender(42)).toBe(false);
    expect(isSystemAccountSender(SYSTEM)).toBe(false); // no domain
    expect(isSystemAccountSender(`${SYSTEM}@`)).toBe(false);
    expect(isSystemAccountSender(`@xmpp.example.com`)).toBe(false);
    expect(isSystemAccountSender(`${SYSTEM}@a@b`)).toBe(false);
    expect(isSystemAccountSender('xmpp.example.com')).toBe(false);
  });

  it('cannot be fooled by the system account name hidden in the resource or domain', () => {
    expect(
      isSystemAccountSender(`mallory@xmpp.example.com/${SYSTEM}@xmpp.example.com`)
    ).toBe(false);
    expect(isSystemAccountSender(`mallory@${SYSTEM}@xmpp.example.com`)).toBe(false);
  });

  it('with an expected domain, a same-named account on another server is rejected', () => {
    expect(isSystemAccountSender(`${SYSTEM}@xmpp.example.com`, 'xmpp.example.com')).toBe(true);
    expect(isSystemAccountSender(`${SYSTEM}@XMPP.Example.com/r`, 'xmpp.example.com')).toBe(true);
    expect(isSystemAccountSender(`${SYSTEM}@evil.example.org`, 'xmpp.example.com')).toBe(false);
    expect(isSystemAccountSender(`${SYSTEM}@conference.xmpp.example.com`, 'xmpp.example.com')).toBe(false);
    // No expected domain known: local part only.
    expect(isSystemAccountSender(`${SYSTEM}@evil.example.org`, '')).toBe(true);
  });
});
