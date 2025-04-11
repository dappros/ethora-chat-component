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
          resolve(response);
        })
        .catch((error) => {
          reject(error);
        });
    } catch (error) {
      console.log('errr');
      store.dispatch(logout());
      reject(error);
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
    const originalRequest = error.config;

    if (!error.response || error.response.status !== 401) {
      return Promise.reject(error);
    }

    if (
      originalRequest.url === '/users/login/refresh' ||
      originalRequest.url === '/users/login'
    ) {
      store.dispatch(logout());
      return Promise.reject(error);
    }

    if (originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (
      store.getState().chatSettingStore?.config?.refreshTokens?.enabled &&
      store.getState().chatSettingStore?.config?.refreshTokens?.refreshFunction
    ) {
      try {
        const { refreshToken, accessToken } = store
          .getState()
          .chatSettingStore?.config?.refreshTokens?.refreshFunction();

        store.dispatch(
          refreshTokens({
            token: accessToken,
            refreshToken: refreshToken,
          })
        );

        originalRequest.headers['Authorization'] = accessToken;
        return http(originalRequest);
      } catch (refreshError) {
        store.dispatch(logout());
        return Promise.reject(refreshError);
      }
    } else {
      if (isRefreshing) {
        return addRequestToQueue(originalRequest);
      } else {
        isRefreshing = true;

        try {
          const tokens = await refresh();
          isRefreshing = false;
          originalRequest.headers['Authorization'] = tokens.data.token;
          processQueue(tokens.data.token);
          return http(originalRequest);
        } catch (refreshError) {
          isRefreshing = false;
          failedQueue = [];
          store.dispatch(logout());
          return Promise.reject(refreshError);
        }
      }
    }
  }
);

export default http;
export { appToken };
