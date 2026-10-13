import { useEffect, useState } from 'react';

// Tracks a max-width media query so a component can pick a smaller prop
// value (e.g. an avatar `size`) on narrow viewports - for props baked
// into a shared styled-component via per-instance interpolation, a CSS
// media query alone can't win without touching that shared component's
// defaults (which would affect every other caller too).
export const useIsMobileViewport = (breakpoint = 480): boolean => {
  const getMatches = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(`(max-width: ${breakpoint}px)`).matches;

  const [isMobile, setIsMobile] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
};

/**
 * Non-hook form of the same check, for event handlers that need the answer
 * at the moment of the event rather than as render state.
 */
export const isMobileViewportNow = (breakpoint = 480): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
