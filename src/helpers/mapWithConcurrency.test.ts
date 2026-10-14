import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './mapWithConcurrency';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('mapWithConcurrency', () => {
  it('never runs more than the limit at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const gates = Array.from({ length: 9 }, () => deferred<void>());

    const run = mapWithConcurrency([0, 1, 2, 3, 4, 5, 6, 7, 8], 4, async (_item, index) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await gates[index].promise;
      inFlight -= 1;
      return index;
    });

    // Let the first wave start, then release them one by one.
    await Promise.resolve();
    expect(inFlight).toBe(4);
    for (const gate of gates) {
      gate.resolve();
      await new Promise((r) => setTimeout(r, 0));
    }
    await run;

    expect(peak).toBe(4);
  });

  it('resolves in input order even when items finish out of order', async () => {
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];

    const run = mapWithConcurrency(['a', 'b', 'c'], 4, (item, index) => gates[index].promise);

    gates[2].resolve('c-done');
    gates[0].resolve('a-done');
    gates[1].resolve('b-done');
    const results = await run;

    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([
      'a-done',
      'b-done',
      'c-done',
    ]);
  });

  it('reports a failing worker without stopping its siblings', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (item) => {
      if (item === 2) throw new Error('boom');
      return item * 10;
    });

    expect(results[0]).toEqual({ status: 'fulfilled', value: 10 });
    expect(results[1].status).toBe('rejected');
    expect(results[2]).toEqual({ status: 'fulfilled', value: 30 });
  });

  it('handles an empty list and a limit above the item count', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);

    const results = await mapWithConcurrency([1, 2], 10, async (item) => item);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([1, 2]);
  });
});
