import http, { setBaseURL } from '../networking/apiClient';
import { loginViaJwt } from '../networking/api-requests/auth.api';
import { getMyUser } from '../networking/api-requests/user.api';
import {
  clearStoredUser,
  getStoredUser,
  hasStoredSensitiveSession,
} from './authStorage';
import { IConfig, User } from '../types/types';
import { store } from '../roomStore';
import { setUser } from '../roomStore/chatSettingsSlice';
import { walletToUsername } from './walletUsername';

interface ResolveInitBeforeLoadUserOptions {
  config?: IConfig;
  signal?: AbortSignal;
}

interface HttpLikeError {
  response?: {
    status?: number;
  };
  message?: string;
}

const getStatusCode = (error: unknown): number | null => {
  const status = (error as HttpLikeError)?.response?.status;
  return typeof status === 'number' ? status : null;
};

const isAuthError = (error: unknown): boolean => {
  const statusCode = getStatusCode(error);
  return statusCode === 401 || statusCode === 403;
};

const isAbortError = (error: unknown): boolean => {
  const message = (error as HttpLikeError)?.message || '';
  return typeof message === 'string' && message.toLowerCase().includes('abort');
};

const hasXmppCredentials = (user?: Partial<User> | null): boolean => {
  return Boolean(user?.xmppPassword && (user?.xmppUsername || user?.defaultWallet?.walletAddress));
};

const normalizeUserForXmpp = (user?: User | null): User | null => {
  if (!user) return null;
  const normalizedXmppUsername =
    user.xmppUsername || walletToUsername(user?.defaultWallet?.walletAddress);

  return {
    ...user,
    xmppUsername: normalizedXmppUsername,
  };
};

const refreshWithToken = async (refreshToken: string) => {
  const response = await http.post('/users/login/refresh', {}, {
    headers: {
      Authorization: refreshToken,
    },
  });

  return {
    token: response?.data?.token || '',
    refreshToken: response?.data?.refreshToken || refreshToken,
  };
};

const mergeUsers = (base?: User | null, patch?: User | null): User | null => {
  if (!base && !patch) return null;
  return {
    ...(base || ({} as User)),
    ...(patch || ({} as User)),
    defaultWallet: {
      walletAddress:
        patch?.defaultWallet?.walletAddress ||
        base?.defaultWallet?.walletAddress ||
        '',
    },
  } as User;
};

const tryHydrateViaMy = async (
  candidate: User,
  myEndpoint?: string,
  signal?: AbortSignal
): Promise<User | null> => {
  if (signal?.aborted) return null;

  const mergedCandidate = normalizeUserForXmpp(candidate);
  if (hasXmppCredentials(mergedCandidate)) {
    return mergedCandidate;
  }

  if (!candidate?.token && !candidate?.refreshToken) {
    return mergedCandidate;
  }

  let workingToken = candidate?.token || '';
  let workingRefresh = candidate?.refreshToken || '';

  if (workingToken) {
    try {
      const myUser = await getMyUser({ token: workingToken, endpoint: myEndpoint });
      const merged = normalizeUserForXmpp(mergeUsers(candidate, myUser));
      if (merged) {
        merged.token = workingToken || merged.token;
        merged.refreshToken = workingRefresh || merged.refreshToken;
      }
      return merged;
    } catch {
      // ignore and try refresh path
    }
  }

  if (!workingRefresh) {
    return normalizeUserForXmpp(candidate);
  }

  try {
    const refreshed = await refreshWithToken(workingRefresh);
    workingToken = refreshed.token;
    workingRefresh = refreshed.refreshToken;

    const myUser = await getMyUser({ token: workingToken, endpoint: myEndpoint });
    const merged = normalizeUserForXmpp(mergeUsers(candidate, myUser));
    if (merged) {
      merged.token = workingToken || merged.token;
      merged.refreshToken = workingRefresh || merged.refreshToken;
    }
    return merged;
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      return null;
    }

    if (isAuthError(error)) {
      return null;
    }

    throw error;
  }
};

export const resolveInitBeforeLoadUser = async (
  options?: ResolveInitBeforeLoadUserOptions
): Promise<User | null> => {
  const { config, signal } = options || {};

  if (signal?.aborted) return null;

  if (config?.baseUrl) {
    setBaseURL(config.baseUrl, config.customAppToken);
  }

  const myEndpoint = config?.initBeforeLoadAuth?.myEndpoint || '/users/my';

  const explicitUser = config?.userLogin?.enabled ? config?.userLogin?.user : null;
  if (explicitUser) {
    const hydrated = await tryHydrateViaMy(explicitUser, myEndpoint, signal).catch(() => null);
    if (hydrated && hasXmppCredentials(hydrated)) {
      return hydrated;
    }
  }

  if (config?.jwtLogin?.enabled && config?.jwtLogin?.token) {
    try {
      const jwtUser = await loginViaJwt(config.jwtLogin.token);
      const normalized = normalizeUserForXmpp(jwtUser);
      if (normalized && hasXmppCredentials(normalized)) {
        return normalized;
      }
    } catch (error) {
      if (signal?.aborted || isAbortError(error) || isAuthError(error)) {
        return null;
      }
      throw error;
    }
  }

  const currentUser = store.getState().chatSettingStore.user;
  if (currentUser?.token || currentUser?.refreshToken || currentUser?.xmppPassword) {
    const hydrated = await tryHydrateViaMy(currentUser as User, myEndpoint, signal).catch(() => null);
    if (hydrated && hasXmppCredentials(hydrated)) {
      return hydrated;
    }
  }

  const storedUser = getStoredUser(config?.appId) as User | null;
  if (storedUser && hasStoredSensitiveSession(storedUser)) {
    const hydrated = await tryHydrateViaMy(storedUser, myEndpoint, signal).catch(() => null);
    if (hydrated && hasXmppCredentials(hydrated)) {
      return hydrated;
    }
    clearStoredUser();
  }

  return null;
};

export const applyResolvedUserToStore = (user?: User | null) => {
  if (!user) return;
  store.dispatch(setUser(user));
};

export default resolveInitBeforeLoadUser;
