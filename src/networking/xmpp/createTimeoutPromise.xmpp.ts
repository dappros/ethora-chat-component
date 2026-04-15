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
