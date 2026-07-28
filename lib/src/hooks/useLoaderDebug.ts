import { useEffect, useRef } from 'react';

type LoaderDebugStat = {
  count: number;
  totalVisibleMs: number;
  activeSince: number | null;
};

type LoaderDebugStore = Record<string, LoaderDebugStat>;

const getLoaderDebugStore = (): LoaderDebugStore => {
  const globalScope = globalThis as typeof globalThis & {
    __ethoraLoaderStats?: LoaderDebugStore;
  };

  if (!globalScope.__ethoraLoaderStats) {
    globalScope.__ethoraLoaderStats = {};
  }

  return globalScope.__ethoraLoaderStats;
};

// Was an unconditional console.log on every SHOW/HIDE for every loader
// this hook tracks (9 call sites - ChatWrapper's connecting/retry/startup
// loaders, ChatRoom's history loader and its 3 sub-conditions,
// MessageList's load-more loader) - noisy in every deployment, not just
// while someone was actually debugging a stuck-loader issue. The stat
// tracking itself is still live in `window.__ethoraLoaderStats` for
// exactly that debugging, just silent unless you go look.
export const useLoaderDebug = (loaderName: string, visible: boolean): void => {
  const previousVisibleRef = useRef<boolean>(false);

  useEffect(() => {
    const store = getLoaderDebugStore();
    if (!store[loaderName]) {
      store[loaderName] = {
        count: 0,
        totalVisibleMs: 0,
        activeSince: null,
      };
    }

    const stat = store[loaderName];

    if (visible && !previousVisibleRef.current) {
      stat.count += 1;
      stat.activeSince = Date.now();
    }

    if (!visible && previousVisibleRef.current) {
      const lastDurationMs = stat.activeSince
        ? Date.now() - stat.activeSince
        : 0;
      stat.totalVisibleMs += lastDurationMs;
      stat.activeSince = null;
    }

    previousVisibleRef.current = visible;
  }, [loaderName, visible]);

  useEffect(() => {
    return () => {
      if (!previousVisibleRef.current) return;

      const store = getLoaderDebugStore();
      const stat = store[loaderName];
      if (!stat) return;

      const lastDurationMs = stat.activeSince ? Date.now() - stat.activeSince : 0;
      stat.totalVisibleMs += lastDurationMs;
      stat.activeSince = null;
    };
  }, [loaderName]);
};

