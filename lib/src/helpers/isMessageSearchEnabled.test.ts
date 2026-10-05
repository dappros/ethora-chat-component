import { describe, expect, it } from 'vitest';
import { isMessageSearchEnabled } from './isMessageSearchEnabled';

describe('isMessageSearchEnabled', () => {
  it('is off by default', () => {
    expect(isMessageSearchEnabled(undefined)).toBe(false);
    expect(isMessageSearchEnabled({})).toBe(false);
    expect(isMessageSearchEnabled({ appId: 'app' })).toBe(false);
  });

  it('is on with enableMessageSearch and an appId', () => {
    expect(
      isMessageSearchEnabled({ enableMessageSearch: true, appId: 'app' })
    ).toBe(true);
  });

  it('stays off without an appId', () => {
    expect(isMessageSearchEnabled({ enableMessageSearch: true })).toBe(false);
  });

  it('lets a leftover disableMessageSearch win', () => {
    expect(
      isMessageSearchEnabled({
        enableMessageSearch: true,
        disableMessageSearch: true,
        appId: 'app',
      })
    ).toBe(false);
  });
});
