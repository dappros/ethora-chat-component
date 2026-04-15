import { persistor, store } from '../roomStore';
import { logout } from '../roomStore/chatSettingsSlice';
import { setLogoutState } from '../roomStore/roomsSlice';
import { useCallback } from 'react';
import { clearHeap } from '../roomStore/roomHeapSlice';
import { clearScopedChatCache } from '../helpers/cacheScope';
import { clearStoredUser } from '../helpers/authStorage';
import { disablePushNotifications } from '../utils/firebasePushNotifications';
import { getGlobalXmppClient, setGlobalXmppClient } from '../utils/clientRegistry';

const logoutService = {
  performLogout: async () => {
    const xmppClient = getGlobalXmppClient();
    if (xmppClient) {
      try {
        await xmppClient.disconnect?.({ suppressReconnect: true });
      } catch (error) {
        console.warn('[Logout] XMPP disconnect failed', error);
      } finally {
        setGlobalXmppClient(null);
      }
    } else {
      setGlobalXmppClient(null);
    }

    try {
      await disablePushNotifications();
    } catch (error) {
      console.warn('[Logout] Push service worker teardown failed', error);
    }
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
