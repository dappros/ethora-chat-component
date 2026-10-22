import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HANDLED_CALLS_STORAGE_KEY,
  HANDLED_CALLS_TTL_MS,
  isCallHandled,
  markCallHandled,
  resetHandledCalls,
} from './handledCalls';

describe('handledCalls', () => {
  beforeEach(() => resetHandledCalls());
  afterEach(() => vi.restoreAllMocks());

  it('remembers a handled call key', () => {
    expect(isCallHandled('c-1')).toBe(false);
    markCallHandled('c-1');
    expect(isCallHandled('c-1')).toBe(true);
    expect(isCallHandled('c-2')).toBe(false);
  });

  it('forgets it after the TTL (about 2 minutes), in memory and in storage', () => {
    const t0 = 1_700_000_000_000;
    markCallHandled('c-1', t0);
    expect(isCallHandled('c-1', t0 + HANDLED_CALLS_TTL_MS - 1)).toBe(true);
    expect(isCallHandled('c-1', t0 + HANDLED_CALLS_TTL_MS + 1)).toBe(false);
    // a tab that never saw the mark in memory reads storage, with the same TTL
    resetHandledCalls();
    localStorage.setItem(HANDLED_CALLS_STORAGE_KEY, JSON.stringify({ 'c-9': t0 }));
    expect(isCallHandled('c-9', t0 + 1000)).toBe(true);
    expect(isCallHandled('c-9', t0 + HANDLED_CALLS_TTL_MS + 1)).toBe(false);
  });

  it('is shared through localStorage, so another tab sees it', () => {
    markCallHandled('c-1');
    const stored = JSON.parse(localStorage.getItem(HANDLED_CALLS_STORAGE_KEY) || '{}');
    expect(Object.keys(stored)).toEqual(['c-1']);
    // simulate a second tab: nothing in its memory, same storage
    const copy = localStorage.getItem(HANDLED_CALLS_STORAGE_KEY) as string;
    resetHandledCalls();
    localStorage.setItem(HANDLED_CALLS_STORAGE_KEY, copy);
    expect(isCallHandled('c-1')).toBe(true);
  });

  it('drops expired entries from storage when it writes', () => {
    const t0 = 1_700_000_000_000;
    markCallHandled('old', t0);
    markCallHandled('new', t0 + HANDLED_CALLS_TTL_MS + 5000);
    const stored = JSON.parse(localStorage.getItem(HANDLED_CALLS_STORAGE_KEY) || '{}');
    expect(Object.keys(stored)).toEqual(['new']);
  });

  it('does not track a call that is only a room (no callId), a new call there would look handled', () => {
    markCallHandled('room:app_a-app_b');
    markCallHandled('incoming-call');
    markCallHandled('');
    markCallHandled(null);
    expect(isCallHandled('room:app_a-app_b')).toBe(false);
    expect(isCallHandled('incoming-call')).toBe(false);
    expect(localStorage.getItem(HANDLED_CALLS_STORAGE_KEY)).toBeNull();
  });

  it('still works in memory when storage is blocked or holds junk', () => {
    localStorage.setItem(HANDLED_CALLS_STORAGE_KEY, '{not json');
    expect(isCallHandled('c-1')).toBe(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => markCallHandled('c-1')).not.toThrow();
    expect(isCallHandled('c-1')).toBe(true);
  });
});
