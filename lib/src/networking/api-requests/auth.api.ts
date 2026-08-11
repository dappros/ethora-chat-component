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
    return await getMyUser({ token });
  } catch {
    return null;
  }
}

// login functions
export async function loginEmail(email: string, password: string) {
  const res = await http.post<{
    user: User;
    refreshToken: string;
    token: string;
    fileToken?: string;
  }>(
    '/v1/users/login-with-email',
    {
      email,
      password,
      'appId':"646cc8dc96d4a4dc8f7b2f2d"
    },
    { headers: { Authorization: appToken } }
  );

  const myUser = await resolveUserViaMyEndpoint(res.data.token);
  if (myUser) {
    res.data.user = { ...res.data.user, ...myUser };
  }
  res.data.user = { ...res.data.user, fileToken: res.data.fileToken || '' };

  return res;
}

export async function loginSocial(
  idToken: string,
  accessToken: string,
  loginType: string,
  authToken: string = 'authToken'
) {
  const response = await http.post<any>(
    '/v1/users/login',
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
  if (response?.data?.user) {
    response.data.user = {
      ...response.data.user,
      fileToken: response.data.fileToken || '',
    };
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
    '/v1/users',
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
    '/v1/users/checkEmail/' + email,

    { headers: { Authorization: appToken } }
  );
}

export async function loginViaJwt(clientToken: string): Promise<User> {
  const response = await http.post<{
    user: User;
    refreshToken: string;
    token: string;
    fileToken?: string;
  }>('/v1/users/client', null, { headers: { 'x-custom-token': clientToken } });
  const user = {
    ...response.data.user,
    refreshToken: response.data.refreshToken,
    token: response.data.token,
    fileToken: response.data.fileToken || '',
  };
  const myUser = await resolveUserViaMyEndpoint(response.data.token);
  return myUser
    ? {
        ...user,
        ...myUser,
        refreshToken: response.data.refreshToken,
        token: response.data.token,
        fileToken: response.data.fileToken || '',
      }
    : user;
}

export const signInWithGoogle = async () => {
  if (!app) {
    console.warn('Firebase app is not configured for Google sign-in');
    return {};
  }
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

// Everything uploads through /v2/files/secure - message attachments and
// room avatars alike. Files land on the secure-files.* host and every
// download is gated by the viewer's personal `?ft=` token, so any URL that
// comes back from here must be run through appendFileToken/withFileToken
// at render time (see helpers/secureFileUrl).
//
// Every upload is scoped to a chat: `activeRoomJID` is required, so a file
// can never reach the secure bucket without the chat it belongs to. The
// new-chat modals therefore create the room first and upload the avatar
// afterwards, with the JID the server just handed them.
export function uploadFile(formData: FormData, activeRoomJID: string) {
  const token = store.getState().chatSettingStore.user.token;
  const chatName = activeRoomJID.split('@')[0];
  formData.append('chatName', chatName);
  return http.post('/v2/files/secure', formData, {
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
