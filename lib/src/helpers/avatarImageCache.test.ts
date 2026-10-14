import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAILED_TTL_MS,
  getLoadedAvatarUrl,
  hasAvatarFailed,
  markAvatarFailed,
  markAvatarLoaded,
  resetAvatarCache,
} from './avatarImageCache';

const SECURE = 'https://secure-files.chat-qa.ethora.com/secure-media/a1.png';

describe('avatarImageCache', () => {
  beforeEach(() => resetAvatarCache());
  afterEach(() => vi.useRealTimers());

  it('returns the already-loaded URL for the same file under a rotated token', () => {
    markAvatarLoaded(`${SECURE}?ft=old`);
    expect(getLoadedAvatarUrl(`${SECURE}?ft=new`)).toBe(`${SECURE}?ft=old`);
    expect(getLoadedAvatarUrl(`${SECURE}b?ft=new`)).toBeUndefined();
  });

  it('does not share blob or data URLs', () => {
    markAvatarLoaded('blob:http://x/1');
    expect(getLoadedAvatarUrl('blob:http://x/1')).toBeUndefined();
  });

  it('remembers a failed exact URL but gives a new token a fresh attempt', () => {
    markAvatarFailed(`${SECURE}?ft=old`);
    expect(hasAvatarFailed(`${SECURE}?ft=old`)).toBe(true);
    expect(hasAvatarFailed(`${SECURE}?ft=new`)).toBe(false);
  });

  it('expires the failure after the TTL', () => {
    vi.useFakeTimers();
    markAvatarFailed('https://files.x/a.jpg');
    vi.advanceTimersByTime(FAILED_TTL_MS + 1);
    expect(hasAvatarFailed('https://files.x/a.jpg')).toBe(false);
  });

  it('stops steering to a loaded URL once it fails', () => {
    markAvatarLoaded(`${SECURE}?ft=old`);
    markAvatarFailed(`${SECURE}?ft=old`);
    expect(getLoadedAvatarUrl(`${SECURE}?ft=new`)).toBeUndefined();
  });
});
