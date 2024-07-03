import axios from "axios";
import { store } from "../roomStore";
import { refreshTokens } from "../roomStore/loginSlice";
import { User } from "../types/types";

const baseURL = "https://api.ethoradev.com/v1";

const http = axios.create({
  baseURL,
});

export function refresh(): Promise<{
  data: { refreshToken: string; token: string };
}> {
  return new Promise((resolve, reject) => {
    const user = store.getState().loginStore.user;
    http
      .post(
        "/users/login/refresh",
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
  console.log(failedQueue);
  for (const request of failedQueue) {
    if (newAccessToken) {
      request.config.headers["Authorization"] = newAccessToken;
    }

    request.resolve(http(request.config));
  }

  failedQueue = [];
};

export function uploadFile(formData: FormData, token: string) {
  return http.post("/files", formData, {
    headers: { Authorization: token },
  });
}

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!error.response || error.response.status !== 401) {
      throw error;
    }
    if (
      originalRequest.url === "/users/login/refresh" ||
      originalRequest.url === "/users/login"
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
        isRefreshing = false;
        originalRequest.headers["Authorization"] = tokens.data.token;
        processQueue(tokens.data.token);
        return http(originalRequest);
      } catch (error) {
        isRefreshing = false;
        return Promise.reject(error);
      }
    }
  }
);

export function loginEmail(email: string, password: string, appToken: string) {
  return http.post<User>(
    "/users/login-with-email",
    {
      email,
      password,
    },
    { headers: { Authorization: appToken } }
  );
}
