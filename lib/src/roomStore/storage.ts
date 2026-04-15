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
    return createWebStorage('local');
  } catch {
    return createWebStorage('session');
  }
};

// Use web storage if available (browser), otherwise use noop (SSR)
const storage = createPreferredWebStorage();

export { storage };
