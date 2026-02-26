import { RootState, store } from '../roomStore';

export const useStoreConsole = () => {
  const state: RootState = store.getState();
  return state;
};

const initializeStoreConsole = () => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const state = store.getState();
    const config = state.chatSettingStore?.config;

    if (config?.useStoreConsoleEnabled === true) {
      (window as any).useStoreConsole = useStoreConsole;
    } else {
      if ((window as any).useStoreConsole) {
        delete (window as any).useStoreConsole;
      }
    }
  } catch (error) {}
};

const patchConsoleForEnvironment = () => {
  if (typeof window === 'undefined') return;
  if ((window as any).__ethoraConsolePatched) return;

  (window as any).__ethoraConsolePatched = true;

  const originalLog = console.log.bind(console);
  const originalInfo = console.info.bind(console);
  const originalDebug = console.debug.bind(console);

  const isDev = (import.meta as any)?.env?.DEV === true;
  const shouldKeepMinimalProdLog = (args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    return first.includes('[EthoraChatComponent] version:');
  };

  const isVerboseRuntime = () => {
    if (isDev) return true;
    try {
      return store.getState().chatSettingStore?.config?.useStoreConsoleEnabled === true;
    } catch {
      return false;
    }
  };

  console.log = (...args: unknown[]) => {
    if (isVerboseRuntime() || shouldKeepMinimalProdLog(args)) {
      originalLog(...args);
    }
  };

  console.info = (...args: unknown[]) => {
    if (isVerboseRuntime()) {
      originalInfo(...args);
    }
  };

  console.debug = (...args: unknown[]) => {
    if (isVerboseRuntime()) {
      originalDebug(...args);
    }
  };
};

if (typeof window !== 'undefined') {
  patchConsoleForEnvironment();
  initializeStoreConsole();

  store.subscribe(() => {
    initializeStoreConsole();
  });
}
