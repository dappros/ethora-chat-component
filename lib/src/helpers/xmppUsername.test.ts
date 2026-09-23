import { describe, expect, it } from 'vitest';
import { isOpaqueXmppUserId } from './xmppUsername';

describe('isOpaqueXmppUserId', () => {
  it('recognizes the standard appId_userId shape', () => {
    expect(
      isOpaqueXmppUserId(
        '646cc8dc96d4a4dc8f7b2f2d_6ab3bdf50708e7041e0f8b96'
      )
    ).toBe(true);
  });

  it('recognizes a bare 24-hex id with no appId prefix', () => {
    expect(isOpaqueXmppUserId('646cc8dc96d4a4dc8f7b2f2d')).toBe(true);
  });

  it('strips the JID resource/domain before checking', () => {
    expect(
      isOpaqueXmppUserId(
        '646cc8dc96d4a4dc8f7b2f2d_6ab3bdf50708e7041e0f8b96@conference.xmpp.chat.ethora.com'
      )
    ).toBe(true);
  });

  it('does not treat a human-readable handle as opaque', () => {
    expect(isOpaqueXmppUserId('alice')).toBe(false);
    expect(isOpaqueXmppUserId('john_doe')).toBe(false);
  });

  it('does not treat a display name that merely contains an underscore as opaque', () => {
    expect(isOpaqueXmppUserId('фів фів')).toBe(false);
  });

  it('rejects an id whose halves are the wrong length', () => {
    expect(isOpaqueXmppUserId('abc_def')).toBe(false);
    expect(isOpaqueXmppUserId('646cc8dc96d4a4dc8f7b2f2')).toBe(false); // 23 chars
  });

  it('returns false for empty input', () => {
    expect(isOpaqueXmppUserId('')).toBe(false);
    expect(isOpaqueXmppUserId(undefined)).toBe(false);
    expect(isOpaqueXmppUserId(null)).toBe(false);
  });
});
