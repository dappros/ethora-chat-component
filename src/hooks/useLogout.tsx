import { persistor, store } from '../roomStore';
import { logout } from '../roomStore/chatSettingsSlice';
import { setCurrentRoom, setLogoutState } from '../roomStore/roomsSlice';
import { useCallback } from 'react';
import { clearHeap } from '../roomStore/roomHeapSlice';
import { clearScopedChatCache } from '../helpers/cacheScope';
import { clearStoredUser } from '../helpers/authStorage';
import { disablePushNotifications } from '../utils/firebasePushNotifications';
import { getGlobalXmppClient, setGlobalXmppClient } from '../utils/clientRegistry';
import { stopOmemo } from '../e2ee';
import { clearSealedAttachmentCache } from '../helpers/sealedAttachments';

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
    // Drops the in-memory OMEMO instance. The keys stay in IndexedDB on
    // purpose: wiping them would make every past message in every encrypted
    // room unreadable for this device after a routine logout.
    stopOmemo();
    // Decrypted attachments are held as object URLs for the session. Unlike
    // the OMEMO keys they must NOT survive a logout: they are plaintext, and
    // the next user of this browser would otherwise be one URL away from them.
    clearSealedAttachmentCache();

    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new Event('ethora-xmpp-logout'));
      } catch {
        // Older browsers may need new CustomEvent; fall through silently.
      }
    }

    store.dispatch(setCurrentRoom({ roomJID: null }));
    try {
      (xmppClient as any)?.setActiveRoomJid?.(null);
    } catch {
      // client builds; ignore.
    }
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
