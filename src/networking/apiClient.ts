import axios from 'axios';
import { store } from '../roomStore';
import { appToken as betaAppToken } from '../api.config';

import { logout, refreshTokens } from '../roomStore/chatSettingsSlice';

let baseURL =
  store.getState().chatSettingStore?.config?.baseUrl ||
  'https://api.ethoradev.com/v1';

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

export function refresh(): Promise<{
  data: { refreshToken: string; token: string };
}> {
  const user = store.getState().chatSettingStore.user;

  if (!user.refreshToken) {
    return Promise.reject(new Error('Refresh token is missing'));
  }

  return http
    .post(
      '/users/login/refresh',
      {},
      { headers: { Authorization: user.refreshToken } }
    )
    .then((response) => {
      store.dispatch(
        refreshTokens({
          token: response.data.token,
          refreshToken: response.data.refreshToken,
        })
      );

      return response;
    })
    .catch((error) => {
      store.dispatch(logout());
      return Promise.reject(error);
    });
}

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  config: any;
}> = [];

const addRequestToQueue = (config: any) => {
  return new Promise((resolve, reject) => {
    failedQueue.push({ resolve, reject, config });
  });
};

const processQueue = (error: unknown, newAccessToken?: string) => {
  for (const request of failedQueue) {
    if (error) {
      request.reject(error);
      continue;
    }

    if (newAccessToken) {
      request.config.headers['Authorization'] = newAccessToken;
    }

    request.resolve(http(request.config));
  }

  failedQueue = [];
};

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
      originalRequest.url === '/users/login/refresh' ||
      originalRequest.url === '/users/login'
    ) {
      return Promise.reject(error);
    }

    if (!refreshConfig?.enabled) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return addRequestToQueue(originalRequest);
    }

    isRefreshing = true;

    try {
      let nextToken = '';

      if (refreshConfig.refreshFunction) {
        const refreshed = await refreshConfig.refreshFunction();

        if (!refreshed?.accessToken) {
          throw new Error('Custom refresh function did not return an access token');
        }

        store.dispatch(
          refreshTokens({
            token: refreshed.accessToken,
            refreshToken:
              refreshed.refreshToken ||
              store.getState().chatSettingStore.user.refreshToken,
          })
        );

        nextToken = refreshed.accessToken;
      } else {
        const tokens = await refresh();
        nextToken = tokens.data.token;
      }

      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers['Authorization'] = nextToken;
      processQueue(null, nextToken);

      return http(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      store.dispatch(logout());
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default http;
export { appToken };
