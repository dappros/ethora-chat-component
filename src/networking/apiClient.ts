import axios from 'axios';
import { store } from '../roomStore';
import { appToken as betaAppToken } from '../api.config';
import { VITE_APP_API_URL } from '../config';

import { logout } from '../roomStore/chatSettingsSlice';
import {
  refreshAuthTokens,
  isRefreshFatalError,
  RefreshResult,
} from './authRefresh';

let baseURL =
  store.getState().chatSettingStore?.config?.baseUrl ||
  VITE_APP_API_URL;

const http = axios.create({
  baseURL,
});

let appToken = betaAppToken;

export function setBaseURL(newBaseURL?: string, customAppToken?: string) {
  if (newBaseURL) {
    baseURL = newBaseURL;
    http.defaults.baseURL = newBaseURL;
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
 * ends the session — see the interceptor below.
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

    const hasRefreshableSession = Boolean(
      refreshConfig.refreshFunction ||
        store.getState().chatSettingStore.user?.refreshToken
    );
    if (!hasRefreshableSession) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      // One shared rotation for every 401 in flight — and, via the Web
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
      // session alone — logging out on those is exactly the mass-logout
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
