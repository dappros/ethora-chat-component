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

const hasXmppCredentials = (user?: Partial<User> | null): boolean =>
  Boolean(
    user?.xmppPassword &&
      (user?.xmppUsername || (user as any)?.defaultWallet?.walletAddress)
  );

// /users/my is metadata-only (firstName, profileImage, etc) enrichment on
// top of a login response that already carries xmpp credentials — the same
// role that reliably 403s on it in resolveInitBeforeLoadUser.ts's bootstrap
// paths also 403s here, since it's the same endpoint. Skipping the call
// once we already have what login actually needs (xmpp creds) means a
// login no longer fails, stalls, or logs a forbidden request purely to
// fetch fields nothing downstream requires.
async function resolveUserViaMyEndpoint(
  token?: string,
  alreadyResolvedUser?: Partial<User> | null
): Promise<User | null> {
  if (!token) return null;
  if (hasXmppCredentials(alreadyResolvedUser)) return null;

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

  const myUser = await resolveUserViaMyEndpoint(res.data.token, res.data.user);
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
  const myUser = await resolveUserViaMyEndpoint(token, response?.data?.user);
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
  const myUser = await resolveUserViaMyEndpoint(response.data.token, user);
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

const SECURE_UPLOAD_ENDPOINT = '/v2/files/secure';
const LEGACY_UPLOAD_ENDPOINT = '/v1/files/';
let secureUploadUnavailable = false;

const cloneFormData = (formData: FormData): FormData => {
  const copy = new FormData();
  formData.forEach((value, key) => copy.append(key, value as string | Blob));
  return copy;
};

const canFallBackToLegacyUpload = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  if (typeof status !== 'number') return true;
  return status !== 401 && status !== 413;
};

const postUpload = (endpoint: string, formData: FormData, token: string) =>
  http.post(endpoint, formData, {
    headers: {
      Authorization: token,
      Accept: '*/*',
    },
  });

export async function uploadFile(formData: FormData, activeRoomJID: string) {
  const token = store.getState().chatSettingStore.user.token;

  if (!secureUploadUnavailable) {
    const secureData = cloneFormData(formData);
    secureData.append('chatName', activeRoomJID.split('@')[0]);

    try {
      return await postUpload(SECURE_UPLOAD_ENDPOINT, secureData, token);
    } catch (error) {
      if (!canFallBackToLegacyUpload(error)) throw error;

      secureUploadUnavailable = true;
      console.warn(
        `[chat] ${SECURE_UPLOAD_ENDPOINT} unavailable, falling back to ${LEGACY_UPLOAD_ENDPOINT} for this session`,
        error
      );
    }
  }

  return postUpload(LEGACY_UPLOAD_ENDPOINT, formData, token);
}

export async function ensureUserFromMy(
  user: User | null | undefined
): Promise<User | null> {
  if (!user) return null;
  const token = (user as any)?.token;
  const myUser = await resolveUserViaMyEndpoint(token, user);
  if (!myUser) return user;
  return { ...user, ...myUser };
}
