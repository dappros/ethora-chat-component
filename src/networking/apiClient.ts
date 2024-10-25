import axios from "axios";
import { store } from "../roomStore";
import { User } from "../types/types";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  User as FirebaseUser,
} from "firebase/auth";
import { app } from "../firebase-config";
import { appToken } from "../api.config";
import { refreshTokens } from "../roomStore/chatSettingsSlice";
// import { appToken } from "../api.config";

const baseURL = "https://api.ethoradev.com/v1";

const http = axios.create({
  baseURL,
});

export function refresh(): Promise<{
  data: { refreshToken: string; token: string };
}> {
  return new Promise((resolve, reject) => {
    const user = store.getState().chatSettingStore.user;
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
  for (const request of failedQueue) {
    if (newAccessToken) {
      request.config.headers["Authorization"] = newAccessToken;
    }

    request.resolve(http(request.config));
  }

  failedQueue = [];
};

export function uploadFile(formData: FormData) {
  const token = store.getState().chatSettingStore.user.token;
  return http.post("/files/", formData, {
    headers: {
      Authorization: token,
      Accept: "*/*",
    },
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
        console.log("tokens", tokens);
        isRefreshing = false;
        originalRequest.headers["Authorization"] = tokens.data.token;
        processQueue(tokens.data.token);
        return http(originalRequest);
      } catch (error) {
        isRefreshing = false;
        return error;
      }
    }
  }
);

export async function loginEmail(email: string, password: string) {
  const res = await http.post<{
    user: User;
    refreshToken: string;
    token: string;
  }>(
    "/users/login-with-email",
    {
      email,
      password,
    },
    { headers: { Authorization: appToken } }
  );

  return res;
}

export const signInWithGoogle = async () => {
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();
  googleProvider.addScope("https://www.googleapis.com/auth/userinfo.email");
  googleProvider.addScope("https://www.googleapis.com/auth/userinfo.profile");
  try {
    const res = await signInWithPopup(auth, googleProvider);
    const user = res.user as FirebaseUser;
    const idToken = await auth?.currentUser?.getIdToken();
    const credential = GoogleAuthProvider.credentialFromResult(res);
    return {
      user,
      idToken,
      credential,
    };
  } catch (error) {
    console.error(error);
    return {};
  }
};

// login functions
export function loginSocial(
  idToken: string,
  accessToken: string,
  loginType: string,
  authToken: string = "authToken"
) {
  return http.post<any>(
    "/users/login",
    {
      idToken,
      accessToken,
      loginType,
      authToken,
    },
    { headers: { Authorization: appToken } }
  );
}

export function registerSocial(
  idToken: string,
  accessToken: string,
  authToken: string,
  loginType: string,
  signUpPlan?: string
) {
  return http.post(
    "/users",
    {
      idToken,
      accessToken,
      loginType,
      authToken: authToken,
      signupPlan: signUpPlan,
    },
    { headers: { Authorization: appToken } }
  );
}

export function checkEmailExist(email: string) {
  return http.get(
    "/users/checkEmail/" + email,

    { headers: { Authorization: appToken } }
  );
}

export async function loginViaJwt(clientToken: string): Promise<User> {
  const response = await http.post<{
    user: User;
    refreshToken: string;
    token: string;
  }>("/users", {}, { headers: { "x-custom-token": clientToken } });

  return response.data.user;
}
