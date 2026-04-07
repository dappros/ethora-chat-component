import { store } from '../roomStore';

const isVerboseConsoleEnabled = () => {
  const isDev = (import.meta as any)?.env?.DEV === true;
  if (isDev) {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return store.getState().chatSettingStore?.config?.useStoreConsoleEnabled === true;
  } catch {
    return false;
  }
};

export const ethoraLogger = {
  log: (...args: unknown[]) => {
    if (isVerboseConsoleEnabled()) {
      console.log(...args);
    }
  },
  info: (...args: unknown[]) => {
    if (isVerboseConsoleEnabled()) {
      console.info(...args);
    }
  },
  debug: (...args: unknown[]) => {
    if (isVerboseConsoleEnabled()) {
      console.debug(...args);
    }
  },
  always: (...args: unknown[]) => {
    console.log(...args);
  },
};
