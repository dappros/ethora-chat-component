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

if (typeof window !== 'undefined') {
  initializeStoreConsole();

  store.subscribe(() => {
    initializeStoreConsole();
  });
}
