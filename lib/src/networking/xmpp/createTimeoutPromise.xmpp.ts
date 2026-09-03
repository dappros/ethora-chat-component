export function createTimeoutPromise(
  ms: number | undefined,
  unsubscribe?: () => void
) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      try {
        if (unsubscribe) {
          unsubscribe();
        }
      } catch (e) {
        // Ignore unsubscribe failures during timeout cleanup.
      }
      reject(new Error(`timeout:${ms ?? 0}`));
    }, ms);
  });
}

/**
 * Same timeout-that-rejects behavior as createTimeoutPromise, but also
 * hands back a cancel handle. createTimeoutPromise's timer keeps running
 * (and holds its closure alive) even after the caller's Promise.race
 * already settled via the "real" branch winning - it only stops once it
 * fires and rejects into a race branch nobody is listening to anymore.
 * Callers that care about that (they clear the handle in a finally) should
 * use this instead; createTimeoutPromise itself is left untouched so
 * existing call sites keep working unchanged.
 */
export function createCancelableTimeoutPromise(
  ms: number | undefined,
  unsubscribe?: () => void
): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timer = null;
      try {
        if (unsubscribe) {
          unsubscribe();
        }
      } catch (e) {
        // Ignore unsubscribe failures during timeout cleanup.
      }
      reject(new Error(`timeout:${ms ?? 0}`));
    }, ms);
  });
  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return { promise, cancel };
}
