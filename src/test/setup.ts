// Vitest global test setup. Loaded before every test file via
// `setupFiles` in `vitest.config.ts`. Keep additions here cheap —
// every test pays this overhead.

import '@testing-library/jest-dom/vitest';

// jsdom doesn't ship `window.matchMedia`; styled-components and a
// few of our components reach for it via theme media-queries.
// Stub returning the "doesn't match" branch — tests render at the
// default breakpoint anyway.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// IntersectionObserver is used by lazy-render in MessageBubble + the
// scroll-restoration hook. jsdom doesn't implement it; provide a
// no-op stub so components mount without crashing.
if (typeof window !== 'undefined' && !(window as { IntersectionObserver?: unknown }).IntersectionObserver) {
  // @ts-expect-error — minimal stub for tests
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}

// jsdom doesn't implement scrollIntoView either.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function noopScrollIntoView() {};
}
