import { describe, expect, it, vi } from 'vitest';
import { withQuotaHandling, isQuotaExceededError } from './storage';

const makeQuotaError = () =>
  new DOMException('exceeded quota', 'QuotaExceededError');

describe('isQuotaExceededError', () => {
  it('recognizes a QuotaExceededError DOMException', () => {
    expect(isQuotaExceededError(makeQuotaError())).toBe(true);
  });

  it('recognizes the Firefox legacy name', () => {
    expect(
      isQuotaExceededError(new DOMException('x', 'NS_ERROR_DOM_QUOTA_REACHED'))
    ).toBe(true);
  });

  it('rejects an unrelated error', () => {
    expect(isQuotaExceededError(new Error('network down'))).toBe(false);
    expect(isQuotaExceededError(new DOMException('x', 'AbortError'))).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
  });
});

describe('withQuotaHandling', () => {
  it('passes a normal setItem through untouched', async () => {
    const engine = {
      getItem: vi.fn(),
      setItem: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn(),
    };
    const wrapped = withQuotaHandling(engine as any);

    await wrapped.setItem('k', 'v');

    expect(engine.setItem).toHaveBeenCalledWith('k', 'v');
    expect(engine.removeItem).not.toHaveBeenCalled();
  });

  it('re-throws an error that is not a quota error', async () => {
    const engine = {
      getItem: vi.fn(),
      setItem: vi.fn().mockRejectedValue(new Error('offline')),
      removeItem: vi.fn(),
    };
    const wrapped = withQuotaHandling(engine as any);

    await expect(wrapped.setItem('k', 'v')).rejects.toThrow('offline');
    expect(engine.removeItem).not.toHaveBeenCalled();
  });

  it('on quota error, clears the key and retries once - succeeding', async () => {
    const engine = {
      getItem: vi.fn(),
      setItem: vi
        .fn()
        .mockRejectedValueOnce(makeQuotaError())
        .mockResolvedValueOnce(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    };
    const wrapped = withQuotaHandling(engine as any);

    await wrapped.setItem('persist:roomMessages', 'huge-payload');

    expect(engine.removeItem).toHaveBeenCalledWith('persist:roomMessages');
    expect(engine.setItem).toHaveBeenCalledTimes(2);
  });

  it('on quota error, gives up quietly (does not throw) if the retry also fails', async () => {
    const engine = {
      getItem: vi.fn(),
      setItem: vi.fn().mockRejectedValue(makeQuotaError()),
      removeItem: vi.fn().mockResolvedValue(undefined),
    };
    const wrapped = withQuotaHandling(engine as any);

    await expect(wrapped.setItem('k', 'v')).resolves.toBeUndefined();
    expect(engine.removeItem).toHaveBeenCalledTimes(1);
    expect(engine.setItem).toHaveBeenCalledTimes(2);
  });
});
