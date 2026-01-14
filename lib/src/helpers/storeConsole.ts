import { RootState, store } from '../roomStore';

// Function to expose the Redux store's state to the browser console
export const useStoreConsole = () => {
  const state: RootState = store.getState(); // Get current state from the store
  return state; // Return the state so it can be accessed in the console
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
  } catch (error) {
  }
};

if (typeof window !== 'undefined') {
  initializeStoreConsole();
  
  store.subscribe(() => {
    initializeStoreConsole();
  });
}
