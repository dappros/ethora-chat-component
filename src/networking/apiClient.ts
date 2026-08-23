import axios from 'axios';
import { store } from '../roomStore';
import { appToken as betaAppToken } from '../api.config';
import { VITE_APP_API_URL } from '../config';

import { logout } from '../roomStore/chatSettingsSlice';
import {
  refreshAuthTokens,
  isRefreshFatalError,
  hasRotatableSession,
  RefreshResult,
} from './authRefresh';

/**
 * The API version belongs to the endpoint, not to the base URL: every
 * path in this SDK carries its own `/v1/` or `/v2/` prefix, because the
 * file endpoints now live on v2 while everything else is still v1.
 *
 * Hosts configured against the older docs still pass
 * `baseUrl: 'https://api.chat.ethora.com/v1'`, which used to be right
 * and now silently produces `/v1/v1/users/...`. Strip it instead of
 * letting every request 404.
 */
const stripApiVersionSuffix = (url?: string): string => {
  if (!url) return '';
  return url.replace(/\/+(v[12])\/*$/i, '');
};

let baseURL = stripApiVersionSuffix(
  store.getState().chatSettingStore?.config?.baseUrl || VITE_APP_API_URL
);

const http = axios.create({
  baseURL,
});

let appToken = betaAppToken;

export function setBaseURL(newBaseURL?: string, customAppToken?: string) {
  if (newBaseURL) {
    baseURL = stripApiVersionSuffix(newBaseURL);
    http.defaults.baseURL = baseURL;
  }
  if (customAppToken) {
    appToken = customAppToken;
  }
}

/**
 * @deprecated Import `refreshAuthTokens` from `./authRefresh` instead.
 *
 * Kept as a thin forwarder so existing call sites keep working while
 * they migrate. Declared as a function (not `const refresh =
 * refreshAuthTokens`) on purpose: this module and `authRefresh` import
 * each other, and a const would capture the binding before the other
 * module finished evaluating.
 *
 * Behaviour change vs. the old implementation: it no longer dispatches
 * `logout()` on every failure. Only a fatal verdict from the backend
 * ends the session - see the interceptor below.
 */
export function refresh(): Promise<RefreshResult> {
  return refreshAuthTokens();
}

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const refreshConfig =
      store.getState().chatSettingStore?.config?.refreshTokens;

    if (!error.response || error.response.status !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    if (
      originalRequest._retry ||
      originalRequest.url === '/v1/users/login/refresh' ||
      originalRequest.url === '/v1/users/login' ||
      originalRequest.url === '/v1/users/login-with-email' ||
      originalRequest.url === '/v1/users/client' ||
      originalRequest.url === '/v1/users/my'
    ) {
      // Login / hydrate endpoints handle their own retry semantics.
      // Triggering the refresh interceptor here would dispatch logout()
      // mid-bootstrap and mask the original error with
      // "Refresh token is missing".
      return Promise.reject(error);
    }

    if (!refreshConfig?.enabled) {
      return Promise.reject(error);
    }

    // Storage-backed, not redux-backed: a second tab rehydrated by
    // redux-persist has its tokens scrubbed out of the store, so the
    // old redux-only check made it give up on every 401 instead of
    // rotating with the token it does have in localStorage.
    if (!hasRotatableSession()) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      // One shared rotation for every 401 in flight - and, via the Web
      // Lock inside `refreshAuthTokens`, one across every tab too. This
      // replaces the old isRefreshing/failedQueue machinery, and the
      // consumer `refreshFunction` branch now lives in there as well so
      // both paths get the same serialisation.
      const tokens = await refreshAuthTokens();

      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers['Authorization'] = tokens.token;

      return http(originalRequest);
    } catch (refreshError) {
      // Only a genuinely dead session logs the user out. A network
      // blip, a 5xx, or a REFRESH_IN_PROGRESS race must leave the
      // session alone - logging out on those is exactly the mass-logout
      // failure mode the new backend scheme would otherwise cause.
      if (isRefreshFatalError(refreshError)) {
        store.dispatch(logout());
      }
      return Promise.reject(refreshError);
    }
  }
);

export default http;
export { appToken };
