/**
 * Utility functions for safe window access in SSR environments
 */

export const isBrowser = (): boolean => {
  return typeof window !== "undefined";
};

export const safeWindow = {
  get innerWidth(): number {
    return isBrowser() ? window.innerWidth : 0;
  },
  get innerHeight(): number {
    return isBrowser() ? window.innerHeight : 0;
  },
  get location(): Location | null {
    return isBrowser() ? window.location : null;
  },
  get localStorage(): Storage | null {
    return isBrowser() && typeof localStorage !== "undefined"
      ? localStorage
      : null;
  },
  addEventListener: (
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ) => {
    if (isBrowser()) {
      window.addEventListener(type, listener, options);
    }
  },
  removeEventListener: (
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions
  ) => {
    if (isBrowser()) {
      window.removeEventListener(type, listener, options);
    }
  },
  setTimeout: (callback: () => void, delay?: number): number => {
    return isBrowser() ? window.setTimeout(callback, delay) : (0 as any);
  },
  clearTimeout: (id: number): void => {
    if (isBrowser()) {
      window.clearTimeout(id);
    }
  },
  history: {
    pushState: (state: any, title: string, url?: string | null): void => {
      if (isBrowser()) {
        window.history.pushState(state, title, url);
      }
    },
    replaceState: (state: any, title: string, url?: string | null): void => {
      if (isBrowser()) {
        window.history.replaceState(state, title, url);
      }
    },
  },
  URL: {
    createObjectURL: (object: Blob | MediaSource): string => {
      return isBrowser() ? window.URL.createObjectURL(object) : "";
    },
  },
  open: (url: string, target?: string): Window | null => {
    return isBrowser() ? window.open(url, target) : null;
  },
  reload: (): void => {
    if (isBrowser()) {
      window.location.reload();
    }
  },
  dispatchEvent: (event: Event): boolean => {
    return isBrowser() ? window.dispatchEvent(event) : false;
  },
};

