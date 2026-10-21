import { Middleware } from '@reduxjs/toolkit';
import { setBlockedUserIds } from '../chatSettingsSlice';
import { ethoraLogger } from '../../helpers/ethoraLogger';

// Re-hydrate the blocked-users list on login, keyed on the logged-in identity
// so the fetch runs once per session.
//
// Why a login-triggered middleware and not just the room-sync paths: `logout`
// clears blockedUserIds, and on a same-user re-login the provider bootstrap
// (xmppProvider.initBeforeLoad) is skipped because its bootstrap key is
// unchanged, so neither prefetchRoomsViaRest nor useGetNewArchRoom re-run and
// the list stays empty - a blocked peer's messages then show as normal until a
// full page reload rehydrates it from persist.
//
// Gated on the same flag as the Block button (config.features.userBlock, and
// never when config.disableUserBlock): when the host has not opted in - which
// is also the case where the backend does not serve /v1/chats/blocked yet - we
// make no request at all, so there is no per-login 404. The GET is still
// wrapped in a catch as a belt-and-suspenders guard for a flag-on/route-missing
// window; a failure leaves the list untouched.
//
// `setUser` and `setConfig` are both handled because `logout` wipes the user
// AND the config, and on re-login their dispatch order is not guaranteed - we
// hydrate as soon as both a logged-in user and the feature flag are present.
let lastHydratedKey = '';

const isFeatureEnabled = (state: any): boolean => {
  const config = state?.chatSettingStore?.config;
  return config?.features?.userBlock === true && !config?.disableUserBlock;
};

const tryHydrate = (storeAPI: any): void => {
  const state = storeAPI.getState();
  if (!isFeatureEnabled(state)) return;

  const user = state?.chatSettingStore?.user;
  const token = user?.token || '';
  const xmppUsername = user?.xmppUsername || '';
  if (!token || !xmppUsername) return;

  const key = `${xmppUsername}|${token}`;
  if (key === lastHydratedKey) return;
  lastHydratedKey = key;

  // Lazy import so this middleware (pulled in by the store module) does not
  // import rooms.api at module-eval time - rooms.api reads store.getState() at
  // its top level, and a static import here would form a store <-> rooms.api
  // cycle that evaluates rooms.api before the store exists.
  void import('../../networking/api-requests/rooms.api')
    .then(({ getBlockedUsers }) => getBlockedUsers())
    .then((list) => {
      storeAPI.dispatch(
        setBlockedUserIds(
          list.map((u) => u.xmppUsername).filter(Boolean) as string[]
        )
      );
    })
    .catch((error) => {
      // Flag is on but the backend route is missing (404) or failed: nothing
      // to hydrate, leave the list as is.
      ethoraLogger.log('Blocked-users hydration skipped', error);
    });
};

export const blockedHydrationMiddleware: Middleware =
  (storeAPI) => (next) => (action: any) => {
    const result = next(action);

    if (action?.type === 'chatSettingStore/logout') {
      // Force the next login to re-fetch, even if it is the same identity.
      lastHydratedKey = '';
      return result;
    }

    if (
      action?.type === 'chatSettingStore/setUser' ||
      action?.type === 'chatSettingStore/setConfig'
    ) {
      tryHydrate(storeAPI);
    }

    return result;
  };
