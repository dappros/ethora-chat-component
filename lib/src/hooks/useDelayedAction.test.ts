import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDelayedAction } from './useDelayedAction';

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

describe('useDelayedAction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setPrefersReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call the action until durationMs has passed', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useDelayedAction(action, 200));

    act(() => {
      result.current.requestAction();
    });
    expect(action).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('ignores a second requestAction while one is already pending', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useDelayedAction(action, 200));

    act(() => {
      result.current.requestAction();
      result.current.requestAction();
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('calls the action synchronously under prefers-reduced-motion', () => {
    setPrefersReducedMotion(true);
    const action = vi.fn();
    const { result } = renderHook(() => useDelayedAction(action, 200));

    act(() => {
      result.current.requestAction();
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.isPending).toBe(false);
  });
});
