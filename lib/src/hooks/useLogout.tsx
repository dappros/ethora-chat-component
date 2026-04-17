import { persistor, store } from '../roomStore';
import { logout } from '../roomStore/chatSettingsSlice';
import { setLogoutState } from '../roomStore/roomsSlice';
import { useCallback } from 'react';
import { clearHeap } from '../roomStore/roomHeapSlice';
import { clearScopedChatCache } from '../helpers/cacheScope';
import { clearStoredUser } from '../helpers/authStorage';
import { disablePushNotifications } from '../utils/firebasePushNotifications';
import { getGlobalXmppClient, setGlobalXmppClient } from '../utils/clientRegistry';

const withTimeout = async (
  task: Promise<unknown>,
  timeoutMs: number
): Promise<void> => {
  await Promise.race([
    task.then(() => undefined).catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
};

const logoutService = {
  performLogout: async () => {
    const authToken = store.getState().chatSettingStore.user.token || '';
    const xmppClient = getGlobalXmppClient();
    try {
      (xmppClient as any)?.markIntentionalLogout?.();
    } catch {
      // Ignore optional method errors.
    }
    setGlobalXmppClient(null);

    // Clear app state immediately so UI doesn't wait on network/teardown latency.
    store.dispatch(logout());
    store.dispatch(setLogoutState());
    store.dispatch(clearHeap());
    clearStoredUser();
    clearScopedChatCache();

    const disconnectPromise = xmppClient
      ? withTimeout(xmppClient.disconnect(), 1500)
      : Promise.resolve();
    const pushTeardownPromise = withTimeout(
      disablePushNotifications(authToken),
      2500
    );
    const persistPromise = withTimeout(
      (async () => {
        await persistor.flush();
        await persistor.purge();
      })(),
      2000
    );

    await Promise.all([disconnectPromise, pushTeardownPromise, persistPromise]);
  },
};
export const useLogout = () => {
  const handleLogout = useCallback(() => {
    void logoutService.performLogout();
  }, []);

  return handleLogout;
};

export { logoutService };
