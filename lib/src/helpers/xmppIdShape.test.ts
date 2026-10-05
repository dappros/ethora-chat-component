import { describe, expect, it } from 'vitest';
import { isOpaqueXmppUserId } from './xmppIdShape';

describe('isOpaqueXmppUserId', () => {
  const HEX = '646cc8dc96d4a4dc8f7b2f2d';
  const HEX2 = '67f6824df5995841ba432679';
  it('treats mongo-form ids as opaque', () => {
    expect(isOpaqueXmppUserId(`${HEX}_${HEX2}`)).toBe(true);
    expect(isOpaqueXmppUserId(HEX)).toBe(true);
    expect(isOpaqueXmppUserId(`${HEX}_${HEX2}@xmpp.host`)).toBe(true);
  });
  it('treats appId_uuid and appId_hex_suffix as opaque', () => {
    expect(
      isOpaqueXmppUserId('app1_123e4567-e89b-12d3-a456-426614174000')
    ).toBe(true);
    expect(
      isOpaqueXmppUserId(`${HEX}_123e4567-e89b-12d3-a456-426614174000`)
    ).toBe(true);
    expect(isOpaqueXmppUserId(`${HEX}_${HEX2}_device1`)).toBe(true);
  });
  it('leaves human names and handles alone', () => {
    expect(isOpaqueXmppUserId('alice')).toBe(false);
    expect(isOpaqueXmppUserId('Alice Doe')).toBe(false);
    expect(isOpaqueXmppUserId('john_smith')).toBe(false);
    expect(isOpaqueXmppUserId('')).toBe(false);
    expect(isOpaqueXmppUserId(undefined)).toBe(false);
  });
});
