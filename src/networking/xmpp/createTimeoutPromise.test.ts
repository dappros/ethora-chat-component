import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  createTimeoutPromise,
  createCancelableTimeoutPromise,
} from './createTimeoutPromise.xmpp';

// Regression: createTimeoutPromise's setTimeout was never cleared once the
// caller's real work already won a Promise.race - the timer stayed alive,
// held its closure (and any unsubscribe callback) in memory, and fired a
// pointless reject/unsubscribe later. createCancelableTimeoutPromise hands
// back a cancel() so callers can clear it once they know they no longer
// need it.
describe('createCancelableTimeoutPromise', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects with a timeout error once the delay elapses', async () => {
    vi.useFakeTimers();
    const { promise } = createCancelableTimeoutPromise(1000);
    const assertion = expect(promise).rejects.toThrow('timeout:1000');
    vi.advanceTimersByTime(1000);
    await assertion;
  });

  it('calling cancel() prevents the timer from ever firing', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const { cancel } = createCancelableTimeoutPromise(1000, unsubscribe);

    cancel();
    vi.advanceTimersByTime(5000);
    // Flush any pending microtasks; nothing should have rejected/thrown.
    await Promise.resolve();

    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('calling cancel() after it already fired is a harmless no-op', async () => {
    vi.useFakeTimers();
    const { promise, cancel } = createCancelableTimeoutPromise(100);
    const assertion = expect(promise).rejects.toThrow('timeout:100');
    vi.advanceTimersByTime(100);
    await assertion;
    expect(() => cancel()).not.toThrow();
  });

  it('createTimeoutPromise keeps its original unguarded behavior', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    const promise = createTimeoutPromise(50, unsubscribe);
    const assertion = expect(promise).rejects.toThrow('timeout:50');
    vi.advanceTimersByTime(50);
    await assertion;
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
