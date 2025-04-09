import { Middleware } from '@reduxjs/toolkit';

export const logoutMiddleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    const result = next(action);

    if (action.type === 'chatSettingStore/logout') {
      if (typeof window !== 'undefined') {
        try {
          setTimeout(() => {
            const xmppProviderElement = document.querySelector(
              '[data-xmpp-provider="true"]'
            );
            if (xmppProviderElement) {
              const client = (xmppProviderElement as any).__xmppClient;
              if (client && typeof client.disconnect === 'function') {
                console.log('Disconnecting XMPP client due to logout');
                client.disconnect();
              }
            }

            const logoutEvent = new CustomEvent('ethora-xmpp-logout');
            window.dispatchEvent(logoutEvent);
          }, 0);
        } catch (error) {
          console.error('Error disconnecting XMPP client:', error);
        }
      }
    }

    return result;
  };
