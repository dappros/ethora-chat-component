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
      console.log(`[LoaderDebug] SHOW ${loaderName}`, {
        count: stat.count,
        totalVisibleMs: stat.totalVisibleMs,
      });
    }

    if (!visible && previousVisibleRef.current) {
      const lastDurationMs = stat.activeSince
        ? Date.now() - stat.activeSince
        : 0;
      stat.totalVisibleMs += lastDurationMs;
      stat.activeSince = null;
      console.log(`[LoaderDebug] HIDE ${loaderName}`, {
        count: stat.count,
        lastDurationMs,
        totalVisibleMs: stat.totalVisibleMs,
      });
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

      console.log(`[LoaderDebug] HIDE ${loaderName} (unmount)`, {
        count: stat.count,
        lastDurationMs,
        totalVisibleMs: stat.totalVisibleMs,
      });
    };
  }, [loaderName]);
};

