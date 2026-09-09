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
  error: (...args: unknown[]) => {
  if (isVerboseConsoleEnabled()) {
    console.error(...args);
  }
  },
  always: (...args: unknown[]) => {
    console.log(...args);
  },
  /**
   * For failures that must never be silent, whatever the verbose-console
   * setting is: today, an uncaught render error caught by the SDK's error
   * boundary. `error` above stays gated so routine debug noise remains
   * opt-in; this one does not, because a swallowed crash leaves the host
   * with a replaced chat pane and no explanation anywhere.
   */
  criticalError: (...args: unknown[]) => {
    console.error(...args);
  },
};
