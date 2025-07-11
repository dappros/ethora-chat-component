export function createTimeoutPromise(
  ms: number | undefined,
  onTimeout?: () => void
) {
  return new Promise((_, reject) => {
    const timeoutId = setTimeout(() => {
      try {
        if (onTimeout) {
          onTimeout();
        }
      } catch (e) {
        console.error('Error in timeout callback:', e);
      }
      reject(new Error('Operation timed out'));
    }, ms);

    return () => {
      clearTimeout(timeoutId);
    };
  });
}
