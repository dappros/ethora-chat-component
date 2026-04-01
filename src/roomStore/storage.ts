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

// Use web storage if available (browser), otherwise use noop (SSR)
const storage =
  typeof window !== 'undefined'
    ? createWebStorage('session')
    : createNoopStorage();

export { storage };
