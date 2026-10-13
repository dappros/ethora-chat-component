import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  registerMediaRetry,
  requestMediaRetry,
  retryMediaSend,
  unregisterMediaRetry,
} from './mediaSendRetry';

afterEach(() => unregisterMediaRetry('msg-retry-test'));

describe('requestMediaRetry', () => {
  it('merges same-tick requests into one run with every index', async () => {
    const runner = vi.fn(async () => true);
    registerMediaRetry('msg-retry-test', runner);

    requestMediaRetry('msg-retry-test', 4);
    requestMediaRetry('msg-retry-test', 5);
    requestMediaRetry('msg-retry-test', 4);
    await Promise.resolve();
    await Promise.resolve();

    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith([4, 5]);
  });

  it('retryMediaSend passes a single index down as a one-item list', async () => {
    const runner = vi.fn(async () => true);
    registerMediaRetry('msg-retry-test', runner);

    await retryMediaSend('msg-retry-test', 2);
    await retryMediaSend('msg-retry-test');

    expect(runner.mock.calls).toEqual([[[2]], [undefined]]);
  });
});
