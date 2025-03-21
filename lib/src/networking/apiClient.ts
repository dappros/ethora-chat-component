import axios from 'axios';
import { store } from '../roomStore';

import { logout, refreshTokens } from '../roomStore/chatSettingsSlice';

let baseURL =
  store.getState().chatSettingStore?.config?.baseUrl ||
  'https://api.ethoradev.com/v1';

console.log('baseUrl', store.getState().chatSettingStore?.config?.baseUrl);

const http = axios.create({
  baseURL,
});

export function setBaseURL(newBaseURL: string | undefined) {
  if (newBaseURL) {
    console.log('upd to ,', newBaseURL);
    baseURL = newBaseURL;
    http.defaults.baseURL = newBaseURL;
  }
}

export function refresh(): Promise<{
  data: { refreshToken: string; token: string };
}> {
  return new Promise((resolve, reject) => {
    const user = store.getState().chatSettingStore.user;
    try {
      http
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
        })
        .catch((error) => {
          reject(error);
        });
    } catch (error) {
      console.log('errr');
      store.dispatch(logout());
    }
  });
}

let isRefreshing = false;
let failedQueue: any[] = [];

const addRequestToQueue = (config: any) => {
  return new Promise((resolve, reject) => {
    failedQueue.push({ resolve, reject, config });
  });
};

const processQueue = (newAccessToken: string) => {
  for (const request of failedQueue) {
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
    if (!store.getState().chatSettingStore?.config?.refreshTokens?.enabled) {
      if (
        store.getState().chatSettingStore?.config?.refreshTokens
          ?.refreshFunction
      ) {
        const { refreshToken, accessToken } = store
          .getState()
          .chatSettingStore?.config?.refreshTokens?.refreshFunction();
        store.dispatch(
          refreshTokens({
            token: accessToken,
            refreshToken: refreshToken,
          })
        );
        return;
      } else {
        const originalRequest = error.config;

        if (!error.response || error.response.status !== 401) {
          throw error;
        }
        if (
          originalRequest.url === '/users/login/refresh' ||
          originalRequest.url === '/users/login'
        ) {
          return Promise.reject(error);
        }

        originalRequest._retry = true;

        if (isRefreshing) {
          const retryOriginalRequest = addRequestToQueue(originalRequest);

          return retryOriginalRequest;
        } else {
          isRefreshing = true;
          try {
            const tokens = await refresh();
            console.log('tokens', tokens);
            isRefreshing = false;
            originalRequest.headers['Authorization'] = tokens.data.token;
            processQueue(tokens.data.token);
            return http(originalRequest);
          } catch (error) {
            isRefreshing = false;
            return error;
          }
        }
      }
    }
  }
);

export default http;
