import { persistor, store } from '../roomStore';
import { logout } from '../roomStore/chatSettingsSlice';
import { setLogoutState } from '../roomStore/roomsSlice';
import { useCallback } from 'react';
import { clearHeap } from '../roomStore/roomHeapSlice';
import { clearScopedChatCache } from '../helpers/cacheScope';
import { clearStoredUser } from '../helpers/authStorage';

const logoutService = {
  performLogout: async () => {
    store.dispatch(logout());
    store.dispatch(setLogoutState());
    store.dispatch(clearHeap());
    clearStoredUser();
    clearScopedChatCache();
    try {
      await persistor.flush();
      await persistor.purge();
    } catch (error) {
      console.warn('[Logout] Persist purge failed', error);
    }
  },
};
export const useLogout = () => {
  const handleLogout = useCallback(() => {
    void logoutService.performLogout();
  }, []);

  return handleLogout;
};

export { logoutService };
