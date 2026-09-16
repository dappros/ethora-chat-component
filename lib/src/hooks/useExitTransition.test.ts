import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useExitTransition } from './useExitTransition';

const setPrefersReducedMotion = (matches: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

describe('useExitTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setPrefersReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders immediately while open', () => {
    const { result } = renderHook(() => useExitTransition(true, 200));
    expect(result.current).toEqual({ shouldRender: true, isExiting: false });
  });

  it('never rendered at all when it starts closed', () => {
    const { result } = renderHook(() => useExitTransition(false, 200));
    expect(result.current).toEqual({ shouldRender: false, isExiting: false });
  });

  it('keeps rendering (isExiting) for durationMs after closing, then stops', () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useExitTransition(isOpen, 200),
      { initialProps: { isOpen: true } }
    );

    rerender({ isOpen: false });
    expect(result.current).toEqual({ shouldRender: true, isExiting: true });

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current).toEqual({ shouldRender: true, isExiting: true });

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toEqual({ shouldRender: false, isExiting: false });
  });

  it('cancels a pending close if isOpen flips back to true mid-exit', () => {
    const { result, rerender } = renderHook(
      ({ isOpen }) => useExitTransition(isOpen, 200),
      { initialProps: { isOpen: true } }
    );

    rerender({ isOpen: false });
    expect(result.current.isExiting).toBe(true);

    rerender({ isOpen: true });
    expect(result.current).toEqual({ shouldRender: true, isExiting: false });

    // The pending unmount timer must have been cancelled - advancing past
    // where it would have fired should not close it again.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toEqual({ shouldRender: true, isExiting: false });
  });

  it('removes immediately under prefers-reduced-motion, no exit window', () => {
    setPrefersReducedMotion(true);
    const { result, rerender } = renderHook(
      ({ isOpen }) => useExitTransition(isOpen, 200),
      { initialProps: { isOpen: true } }
    );

    rerender({ isOpen: false });
    expect(result.current).toEqual({ shouldRender: false, isExiting: false });
  });
});
