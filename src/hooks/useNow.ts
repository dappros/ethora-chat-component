import { useEffect, useState } from 'react';

/**
 * `Date.now()` that re-renders its component every `intervalMs` while
 * `enabled`. For things that change with the clock (a Join button that opens
 * 15 minutes before the start) without each caller owning a timer.
 */
export const useNow = (intervalMs: number, enabled: boolean = true): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
};
