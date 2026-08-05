import { useEffect, useRef, useState } from 'react';

interface UseInViewOptions {
  /** Start work slightly before the element scrolls into view. */
  rootMargin?: string;
  /** Once true, stay true - re-rendering a thumbnail on every scroll pass is waste. */
  once?: boolean;
}

/**
 * Viewport gate for expensive per-message work (PDF rendering today).
 * Environments without IntersectionObserver - jsdom, older Safari - report
 * "in view" immediately, which degrades to the previous eager behaviour
 * rather than to a blank card.
 */
export const useInView = <T extends Element>({
  rootMargin = '200px',
  once = true,
}: UseInViewOptions = {}) => {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === 'undefined'
  );

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const element = ref.current;
    if (!element) return undefined;
    if (inView && once) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries.some((entry) => entry.isIntersecting);
        if (isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin, once, inView]);

  return { ref, inView };
};
