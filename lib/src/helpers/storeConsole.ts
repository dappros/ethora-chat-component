import { RootState, store } from "../roomStore";

// Function to expose the Redux store's state to the browser console
export const useStoreConsole = () => {
  const state: RootState = store.getState(); // Get current state from the store
  return state; // Return the state so it can be accessed in the console
};

// Make the function globally available in the browser
(window as any).useStoreConsole = useStoreConsole;
