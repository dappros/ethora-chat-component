import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLoaderDebug } from './useLoaderDebug';

// Regression: every SHOW/HIDE used to console.log unconditionally in every
// deployment, not just while someone was actually chasing a stuck-loader
// bug - that's the console noise this test guards against. The stat
// tracking itself (window.__ethoraLoaderStats) must keep working, just
// silently.
describe('useLoaderDebug', () => {
  afterEach(() => {
    delete (globalThis as any).__ethoraLoaderStats;
    vi.restoreAllMocks();
  });

  it('never logs to the console on show or hide', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { rerender, unmount } = renderHook(
      ({ visible }) => useLoaderDebug('test-loader', visible),
      { initialProps: { visible: false } }
    );

    rerender({ visible: true });
    rerender({ visible: false });
    rerender({ visible: true });
    unmount();

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('still tracks show count and visible duration silently', () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(
      ({ visible }) => useLoaderDebug('tracked-loader', visible),
      { initialProps: { visible: false } }
    );

    rerender({ visible: true });
    vi.advanceTimersByTime(150);
    rerender({ visible: false });

    const stats = (globalThis as any).__ethoraLoaderStats['tracked-loader'];
    expect(stats.count).toBe(1);
    expect(stats.totalVisibleMs).toBe(150);
    expect(stats.activeSince).toBeNull();

    unmount();
    vi.useRealTimers();
  });

  it('accounts for the visible time even when unmounted while still showing', () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(
      ({ visible }) => useLoaderDebug('unmount-loader', visible),
      { initialProps: { visible: false } }
    );

    rerender({ visible: true });
    vi.advanceTimersByTime(75);
    unmount();

    const stats = (globalThis as any).__ethoraLoaderStats['unmount-loader'];
    expect(stats.totalVisibleMs).toBe(75);
    expect(stats.activeSince).toBeNull();

    vi.useRealTimers();
  });
});
