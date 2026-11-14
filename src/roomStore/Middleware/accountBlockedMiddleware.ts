import { Middleware } from '@reduxjs/toolkit';
import { ethoraLogger } from '../../helpers/ethoraLogger';
import type { AccountBlockedInfo } from '../../helpers/accountBlocked';
import {
  getGlobalXmppClient,
  setGlobalXmppClient,
} from '../../utils/clientRegistry';

/** Window event fired once when the account becomes blocked. */
export const ACCOUNT_BLOCKED_EVENT = 'ethora-account-blocked';

const toInfo = (status: any): AccountBlockedInfo | null => {
  if (!status) return null;
  const info: AccountBlockedInfo = { blocked: status.blocked, code: status.code };
  if (status.suspension) info.suspension = status.suspension;
  return info;
};

/**
 * Runs once when the account becomes blocked (suspended or archived):
 *
 *  - closes the XMPP connection with reconnects suppressed. The server has
 *    disabled the account, so every reconnect would end in `not-authorized`
 *    and another credential refresh;
 *  - tells the host through `config.onAccountBlocked`, once per block.
 *
 * The session itself is kept (no logout): a reload asks the server again,
 * which shows the notice again or, if the block was lifted, the chat.
 */
export const accountBlockedMiddleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    if (action?.type !== 'chatSettingStore/setAccountBlocked') {
      return next(action);
    }

    const before = storeAPI.getState()?.chatSettingStore?.accountStatus;
    const result = next(action);
    const after = storeAPI.getState()?.chatSettingStore?.accountStatus;
    if (before || !after) return result;

    const client = getGlobalXmppClient();
    if (client && typeof client.disconnect === 'function') {
      try {
        ethoraLogger.log('[accountBlocked] closing XMPP connection');
        void client.disconnect({ suppressReconnect: true });
      } catch (error) {
        console.warn('[accountBlocked] XMPP disconnect failed', error);
      }
    }
    setGlobalXmppClient(null);

    // XmppProvider keeps its own reference to the client; this lets it drop
    // it (see its listener), so a later sign-in starts a fresh connection.
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent(ACCOUNT_BLOCKED_EVENT, { detail: toInfo(after) })
        );
      } catch (error) {
        console.warn('[accountBlocked] event dispatch failed', error);
      }
    }

    const handler = storeAPI.getState()?.chatSettingStore?.config
      ?.onAccountBlocked;
    if (typeof handler === 'function') {
      try {
        const maybePromise = handler(toInfo(after));
        if (maybePromise && typeof maybePromise.catch === 'function') {
          maybePromise.catch((error: unknown) =>
            console.warn('[accountBlocked] onAccountBlocked rejected', error)
          );
        }
      } catch (error) {
        console.warn('[accountBlocked] onAccountBlocked threw', error);
      }
    }

    return result;
  };
