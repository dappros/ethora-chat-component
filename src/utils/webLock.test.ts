import { afterEach, describe, expect, it, vi } from 'vitest';
import { claimOnce, withWebLock } from './webLock';

// A tiny lock manager: exclusive locks by name, ifAvailable support.
const makeLocks = () => {
  const held = new Set<string>();
  const waiting = new Map<string, (() => void)[]>();
  return {
    request: vi.fn(
      (name: string, optionsOrCb: any, maybeCb?: (lock: unknown) => Promise<unknown>) => {
        const options = typeof optionsOrCb === 'function' ? {} : optionsOrCb;
        const cb = typeof optionsOrCb === 'function' ? optionsOrCb : maybeCb!;
        const run = async () => {
          held.add(name);
          try {
            return await cb({ name });
          } finally {
            held.delete(name);
            waiting.get(name)?.shift()?.();
          }
        };
        if (!held.has(name)) return run();
        if (options.ifAvailable) return Promise.resolve(cb(null));
        return new Promise((resolve, reject) => {
          const queue = waiting.get(name) || [];
          queue.push(() => run().then(resolve, reject));
          waiting.set(name, queue);
        });
      }
    ),
  };
};

describe('webLock', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (navigator as any).locks;
  });

  it('without Web Locks the task just runs and a claim is true right away', async () => {
    expect(claimOnce('x')).toBe(true);
    await expect(withWebLock('x', async () => 7)).resolves.toBe(7);
  });

  it('withWebLock serialises two tasks under one name', async () => {
    (navigator as any).locks = makeLocks();
    const order: string[] = [];
    const slow = withWebLock('n', async () => {
      order.push('a:start');
      await new Promise((r) => setTimeout(r, 10));
      order.push('a:end');
    });
    const fast = withWebLock('n', async () => {
      order.push('b');
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(['a:start', 'a:end', 'b']);
  });

  it('withWebLock runs the task once when the lock manager itself throws, and rethrows the task\'s own error', async () => {
    (navigator as any).locks = {
      request: vi.fn(async () => {
        throw new Error('SecurityError');
      }),
    };
    const task = vi.fn(async () => 'ok');
    await expect(withWebLock('n', task)).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(1);

    (navigator as any).locks = makeLocks();
    const failing = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(withWebLock('n', failing)).rejects.toThrow('boom');
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('claimOnce: the first caller wins, the others lose, and it frees up after the hold', async () => {
    vi.useFakeTimers();
    (navigator as any).locks = makeLocks();
    const first = claimOnce('call', 3000) as Promise<boolean>;
    const second = claimOnce('call', 3000) as Promise<boolean>;
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(3001);
    await expect(claimOnce('call', 3000)).resolves.toBe(true);
  });

  it('claimOnce: different names do not compete', async () => {
    (navigator as any).locks = makeLocks();
    await expect(claimOnce('a', 10)).resolves.toBe(true);
    await expect(claimOnce('b', 10)).resolves.toBe(true);
  });

  it('claimOnce falls back to true when the lock manager throws', async () => {
    (navigator as any).locks = {
      request: () => {
        throw new Error('nope');
      },
    };
    await expect(claimOnce('x')).resolves.toBe(true);
  });
});
