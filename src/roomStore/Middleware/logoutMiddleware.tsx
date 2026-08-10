import { Middleware } from '@reduxjs/toolkit';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import { getGlobalXmppClient, setGlobalXmppClient } from '../../utils/clientRegistry';

export const logoutMiddleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    if (!action || !action.type) {
      console.error('Invalid action in logoutMiddleware:', action);
      return next(action);
    }

    const result = next(action);

    if (action.type === 'chatSettingStore/logout') {
      // Disconnect synchronously, in the same tick as the logout action -
      // NOT via setTimeout(0) - so XmppClient.disconnect()'s synchronous
      // removeAllListeners() (see xmppClient.ts) runs immediately. Every
      // tick this is deferred is a tick where a live stanza can still
      // reach messageNotificationManager and fire a browser notification
      // for a user the UI already shows as logged out.
      //
      // The DOM-query-based lookup this used to do
      // (`document.querySelector('[data-xmpp-provider="true"]')`) never
      // worked: that attribute sits on a React Context.Provider, which
      // renders no DOM node, so the query always returned null and this
      // branch silently never ran - getGlobalXmppClient() is the same
      // reliable accessor useLogout.tsx's explicit logout path already
      // uses.
      const client = getGlobalXmppClient();
      if (client && typeof client.disconnect === 'function') {
        try {
          ethoraLogger.log('Disconnecting XMPP client due to logout');
          void client.disconnect({ suppressReconnect: true });
        } catch (error) {
          console.error('Error disconnecting XMPP client:', error);
        }
      }
      setGlobalXmppClient(null);

      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('ethora-xmpp-logout'));
        } catch (error) {
          console.error('Error dispatching ethora-xmpp-logout:', error);
        }
      }
    }

    return result;
  };
