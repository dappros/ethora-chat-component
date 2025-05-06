/**
 * Throttles a function to ensure it's called at most once within a specified time limit.
 * @param func The function to throttle.
 * @param limit The throttle time limit in milliseconds.
 * @returns A throttled version of the function.
 */
export const throttle = (func: (...args: any[]) => void, limit: number) => {
  let inThrottle: boolean;
  let lastFunc: ReturnType<typeof setTimeout>;
  let lastRan: number;

  return function (this: any, ...args: any[]) {
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      lastRan = Date.now();
      inThrottle = true;
      lastFunc = setTimeout(() => {
        inThrottle = false;
      }, limit);
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(
        () => {
          if (Date.now() - lastRan >= limit) {
            func.apply(context, args);
            lastRan = Date.now();
          }
        },
        limit - (Date.now() - lastRan)
      );
    }
  };
};
