import http, { setBaseURL } from '../networking/apiClient';
import { loginViaJwt } from '../networking/api-requests/auth.api';
import { getMyUser } from '../networking/api-requests/user.api';
import { getStoredUser, hasStoredSensitiveSession } from './authStorage';
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
  const response = await http.post('/v1/users/login/refresh', {}, {
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

  if (!candidate?.token && !candidate?.refreshToken) {
    return mergedCandidate;
  }

  let workingToken = candidate?.token || '';
  let workingRefresh = candidate?.refreshToken || '';

  // /users/my is metadata-only (firstName, profileImage, etc). It must
  // never gate bootstrap when we already hold xmpp credentials — some
  // server configurations 403 this endpoint for non-admin roles even
  // though the user is authenticated for chat.
  const candidateWithCurrentTokens = (): User => ({
    ...candidate,
    token: workingToken || candidate.token,
    refreshToken: workingRefresh || candidate.refreshToken,
  });

  const fallbackWithCreds = (): User | null => {
    const normalized = normalizeUserForXmpp(candidateWithCurrentTokens());
    if (normalized && hasXmppCredentials(normalized)) {
      return normalized;
    }
    return null;
  };

  if (workingToken) {
    try {
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
      // Auth error: token may simply be expired. Always try refresh
      // first so downstream calls (/chats/my, etc.) get a fresh token,
      // then fall back to xmpp creds only if /users/my still fails.
      if (isAuthError(error)) {
        if (!workingRefresh) {
          return fallbackWithCreds();
        }
        // fall through to refresh path
      } else {
        // Non-auth failure (network, etc.). Refresh won't help — keep
        // existing tokens and proceed if we have xmpp creds.
        const fallback = fallbackWithCreds();
        if (fallback) {
          return fallback;
        }
        return null;
      }
    }
  }

  if (!workingRefresh) {
    return mergedCandidate;
  }

  try {
    const refreshed = await refreshWithToken(workingRefresh);
    workingToken = refreshed.token;
    workingRefresh = refreshed.refreshToken;

    try {
      const myUser = await getMyUser({ token: workingToken, endpoint: myEndpoint });
      const merged = normalizeUserForXmpp(
        mergeUsers(candidateWithCurrentTokens(), myUser)
      );
      if (merged) {
        merged.token = workingToken || merged.token;
        merged.refreshToken = workingRefresh || merged.refreshToken;
      }
      return merged;
    } catch (myError) {
      if (signal?.aborted || isAbortError(myError)) {
        return null;
      }
      // /users/my still failing post-refresh — proceed with refreshed
      // tokens if the candidate already has xmpp creds.
      const fallback = fallbackWithCreds();
      if (fallback) {
        return fallback;
      }
      if (isAuthError(myError)) {
        return null;
      }
      throw myError;
    }
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

  const myEndpoint = config?.initBeforeLoadAuth?.myEndpoint || '/v1/users/my';

  const explicitUser = config?.userLogin?.enabled ? config?.userLogin?.user : null;
  if (explicitUser) {
    const candidate = normalizeUserForXmpp(explicitUser);

    if (candidate && hasXmppCredentials(candidate)) {
      return candidate;
    }

    const hydrated = await tryHydrateViaMy(explicitUser, myEndpoint, signal).catch(() => null);
    if (hydrated && hasXmppCredentials(hydrated)) {
      return hydrated;
    }

    return null;
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

  // Neither of these two fallbacks calls /users/my anymore - unlike the
  // explicitUser path above (a host deliberately opting into token-only
  // login), these fire on every bootstrap that reaches this point, for
  // every session restore, whether or not the account's role even has
  // the ACL for that endpoint. Measured live against a real QA backend:
  // /users/my reliably 403s ("!reqUserAcl") for at least one real role,
  // so this network round trip was pure overhead (and console/network
  // noise) for exactly the accounts it can never help - a candidate
  // lacking xmpp credentials here still lacks them whether or not the
  // request succeeds, since only currentUser/storedUser (not the /users/my
  // response) ever supplies xmppUsername/xmppPassword for these two paths.
  const currentUser = store.getState().chatSettingStore.user;
  const normalizedCurrentUser = normalizeUserForXmpp(currentUser as User);
  if (normalizedCurrentUser && hasXmppCredentials(normalizedCurrentUser)) {
    return normalizedCurrentUser;
  }

  const storedUser = getStoredUser(config?.appId) as User | null;
  if (storedUser && hasStoredSensitiveSession(storedUser)) {
    const normalizedStoredUser = normalizeUserForXmpp(storedUser);
    if (normalizedStoredUser && hasXmppCredentials(normalizedStoredUser)) {
      return normalizedStoredUser;
    }
  }

  return null;
};

export const applyResolvedUserToStore = (user?: User | null) => {
  if (!user) return;
  store.dispatch(setUser(user));
};

export default resolveInitBeforeLoadUser;
