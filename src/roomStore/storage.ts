import createWebStorage from 'redux-persist/lib/storage/createWebStorage';

// Custom storage implementation that handles SSR
// Create a noop storage for SSR (Server-Side Rendering)
const createNoopStorage = () => {
  return {
    getItem(_key: string) {
      return Promise.resolve(null);
    },
    setItem(_key: string, value: any) {
      return Promise.resolve(value);
    },
    removeItem(_key: string) {
      return Promise.resolve();
    },
  };
};

export const isQuotaExceededError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' ||
    // Firefox's legacy name for the same condition.
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED');

// Wraps a storage engine's setItem so a full localStorage quota degrades
// gracefully instead of surfacing a raw, repeating console error: the
// persist transforms (see roomStore/index.ts) already keep normal writes
// well under quota, so hitting this means something else in localStorage
// (a stale/oversized key from a prior session, another app on the same
// origin, etc.) is eating the budget - clear this key and retry once to
// reclaim its own space before giving up. Either way the live Redux state
// is untouched; a failed persist only means that write won't survive a
// reload, not that the app breaks.
export const withQuotaHandling = (
  engine: ReturnType<typeof createWebStorage>
): ReturnType<typeof createWebStorage> => ({
  ...engine,
  setItem: async (key: string, value: string) => {
    try {
      return await engine.setItem(key, value);
    } catch (error) {
      if (!isQuotaExceededError(error)) throw error;
      console.warn(
        `[ethora] localStorage quota exceeded writing "${key}" (${value?.length ?? 0} chars) - clearing this key and retrying once.`
      );
      try {
        await engine.removeItem(key);
        return await engine.setItem(key, value);
      } catch (retryError) {
        console.warn(
          `[ethora] still over quota after clearing "${key}" - skipping this persist write.`,
          retryError
        );
        return undefined;
      }
    }
  },
});

const createPreferredWebStorage = () => {
  if (typeof window === 'undefined') {
    return createNoopStorage();
  }

  // Prefer localStorage to keep chat cache across page leaves/reloads.
  // Fallback to sessionStorage if localStorage is unavailable.
  try {
    const testKey = '__ethora_chat_storage_probe__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return withQuotaHandling(createWebStorage('local'));
  } catch {
    return withQuotaHandling(createWebStorage('session'));
  }
};

// Use web storage if available (browser), otherwise use noop (SSR)
const storage = createPreferredWebStorage();

export { storage };
