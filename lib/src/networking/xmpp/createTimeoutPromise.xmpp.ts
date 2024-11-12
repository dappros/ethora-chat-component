export function createTimeoutPromise(
  ms: number | undefined,
  unsubscribe: { (): void; (): void }
) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      try {
        unsubscribe();
      } catch (e) {}
      reject();
    }, ms);
  });
}
