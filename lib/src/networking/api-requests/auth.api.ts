import { User } from '../../types/types';

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  User as FirebaseUser,
} from 'firebase/auth';
import { app } from '../../firebase-config';

import http, { appToken } from '../apiClient';
import { store } from '../../roomStore';
import { getMyUser } from './user.api';

async function resolveUserViaMyEndpoint(token?: string): Promise<User | null> {
  if (!token) return null;

  try {
    return await getMyUser({ token, endpoint: '/my' });
  } catch {
    try {
      return await getMyUser({ token, endpoint: '/users/my' });
    } catch {
      return null;
    }
  }
}

// login functions
export async function loginEmail(email: string, password: string) {
  const res = await http.post<{
    user: User;
    refreshToken: string;
    token: string;
  }>(
    '/users/login-with-email',
    {
      email,
      password,
    },
    { headers: { Authorization: appToken } }
  );

  const myUser = await resolveUserViaMyEndpoint(res.data.token);
  if (myUser) {
    res.data.user = { ...res.data.user, ...myUser };
  }

  return res;
}

export async function loginSocial(
  idToken: string,
  accessToken: string,
  loginType: string,
  authToken: string = 'authToken'
) {
  const response = await http.post<any>(
    '/users/login',
    {
      idToken,
      accessToken,
      loginType,
      authToken,
    },
    { headers: { Authorization: appToken } }
  );

  const token = response?.data?.token as string | undefined;
  const myUser = await resolveUserViaMyEndpoint(token);
  if (myUser && response?.data?.user) {
    response.data.user = { ...response.data.user, ...myUser };
  }

  return response;
}

export function registerSocial(
  idToken: string,
  accessToken: string,
  authToken: string,
  loginType: string,
  signUpPlan?: string
) {
  return http.post(
    '/users',
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
    '/users/checkEmail/' + email,

    { headers: { Authorization: appToken } }
  );
}

export async function loginViaJwt(clientToken: string): Promise<User> {
  const response = await http.post<{
    user: User;
    refreshToken: string;
    token: string;
  }>('/users/client', null, { headers: { 'x-custom-token': clientToken } });
  const user = {
    ...response.data.user,
    refreshToken: response.data.refreshToken,
    token: response.data.token,
  };
  const myUser = await resolveUserViaMyEndpoint(response.data.token);
  return myUser
    ? {
        ...user,
        ...myUser,
        refreshToken: response.data.refreshToken,
        token: response.data.token,
      }
    : user;
}

export const signInWithGoogle = async () => {
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();
  googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
  googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');
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

export function uploadFile(formData: FormData) {
  const token = store.getState().chatSettingStore.user.token;
  return http.post('/files/', formData, {
    headers: {
      Authorization: token,
      Accept: '*/*',
    },
  });
}

export async function ensureUserFromMy(
  user: User | null | undefined
): Promise<User | null> {
  if (!user) return null;
  const token = (user as any)?.token;
  const myUser = await resolveUserViaMyEndpoint(token);
  if (!myUser) return user;
  return { ...user, ...myUser };
}
