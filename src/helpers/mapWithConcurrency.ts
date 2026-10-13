/**
 * Runs `worker` over `items` with at most `limit` calls in flight, and
 * resolves with the results in INPUT order, whatever order the calls finish
 * in. Workers that throw are reported as rejected entries instead of
 * aborting the rest of the batch, so one failed upload never stops its
 * siblings.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let next = 0;

  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        const value = await worker(items[index], index);
        results[index] = { status: 'fulfilled', value };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };

  await Promise.all(Array.from({ length: width }, () => lane()));
  return results;
}
