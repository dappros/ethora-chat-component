import { sha256 } from 'js-sha256';
import { createTransform } from 'redux-persist';
import { encryptTransform } from 'redux-persist-transform-encrypt';
import { appToken } from '../api.config';
import { getStoredUser } from '../helpers/authStorage';
import { localStorageConstants } from '../helpers/constants/LOCAL_STORAGE';
import { User } from '../types/types';

// WHY THIS FILE EXISTS
//
// redux-persist encrypts `persist:roomMessages` and
// `persist:chatSettingStore` (the user's session record and a cache of
// their chat history) with AES. Until now the key was the literal
// string 'hey-this-is-dappros', compiled into every published
// `dist/main-*.js`. A key that ships in the bundle is not a key: anyone
// can grep it out of the CDN copy of the SDK and decrypt ANY user's
// localStorage blob with it. That is obfuscation, not encryption.
//
// The key is now derived per session from values that belong to the
// signed-in account, so:
//   - there is nothing key-shaped left in the bundle to extract, and
//   - one recovered blob is only ever readable as the account it was
//     written for; there is no single key that opens everybody's.
//
// WHAT THIS DOES NOT DO. Be honest about the limit: the derivation
// inputs live in the SAME localStorage as the blob they protect, and
// they have to, because the key must resolve synchronously at rehydrate
// before any network call. So an attacker who can already read the
// user's storage or run script in the page (XSS, a malicious extension,
// physical access to an unlocked profile) can derive the key exactly
// the way we do. This change removes the bundle-extractable master key
// and the cross-user reuse it allowed. It is not, and cannot be, a
// defence against an attacker who already holds the user's token or has
// DOM access.

/**
 * Namespace + version tag mixed into every derived key. Bumping it is
 * the emergency lever that invalidates every persisted blob in the
 * field at once (they simply stop decrypting, and the discard path
 * below rewrites them clean).
 */
const KEY_NAMESPACE = 'ethora-chat-persist/v1';

/**
 * WHICH CLAIMS, AND WHY NOT THE WHOLE TOKEN.
 *
 * The obvious input, `user.token`, is the wrong one: it rotates.
 * `authRefresh.ts` runs refresh-token rotation with reuse detection, so
 * the access token string changes several times an hour. Key the
 * encryption on the whole token and every rotation orphans the blob
 * that the previous token wrote: the user would lose their entire chat
 * cache on a schedule, silently, and each reload would start from an
 * empty transcript until MAM caught up.
 *
 * So we derive from the parts of the token that are stable for the life
 * of the ACCOUNT rather than the life of the credential: the `userId`
 * and `appId` claims out of the JWT payload (Ethora issues
 * `{ data: { userId, appId }, iat, exp }`). `iat` / `exp` / the
 * signature are deliberately excluded - they are exactly the parts that
 * change on refresh.
 *
 * `appToken` joins them as a build-time constant so two different apps
 * embedding the SDK on one origin never derive the same key. It adds no
 * secrecy on its own (it is in the bundle), which is why it is a
 * component of the key and not the key.
 */
export interface PersistKeyIdentity {
  userId: string;
  appId: string;
}

/** The key used when there is no session: SSR, logged out, first paint. */
export const ANONYMOUS_PERSIST_SECRET_KEY = sha256(
  [KEY_NAMESPACE, 'anonymous', appToken].join('|')
);

const decodeJwtPayload = (
  token?: string | null
): Record<string, any> | null => {
  if (!token || typeof token !== 'string') return null;
  // Ethora hands tokens around prefixed, as "JWT <base64url payload>".
  const raw = token.trim().replace(/^JWT\s+/i, '');
  const parts = raw.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const decoded =
      typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('binary');
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // Not a parseable JWT. The caller falls back to the plain user
    // fields; a bad token must never break persistence.
    return null;
  }
};

/**
 * Stable account identity for the key, read from the JWT payload first
 * and from the stored user record second. The fallback matters for
 * hosts that hand the SDK a user object without an Ethora access token
 * (they run their own auth and supply `refreshTokens.refreshFunction`).
 */
export const readStableIdentity = (
  user?: Partial<User> | null
): PersistKeyIdentity | null => {
  const payload = decodeJwtPayload(user?.token);
  const claims =
    payload?.data && typeof payload.data === 'object' ? payload.data : payload;

  const userId = String(
    claims?.userId ?? claims?._id ?? user?._id ?? ''
  ).trim();
  const appId = String(claims?.appId ?? user?.appId ?? '').trim();

  if (!userId && !appId) return null;
  return { userId, appId };
};

export const derivePersistSecretKey = (
  identity?: PersistKeyIdentity | null
): string => {
  if (!identity) return ANONYMOUS_PERSIST_SECRET_KEY;
  return sha256(
    [KEY_NAMESPACE, identity.userId, identity.appId, appToken].join('|')
  );
};

const readRawStoredSession = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(
      localStorageConstants.ETHORA_USER_SESSION
    );
  } catch {
    // Storage disabled (private mode, blocked cookies). Anonymous key;
    // nothing is being persisted in that situation anyway.
    return null;
  }
};

// Memoised on the RAW session string, not on the parsed identity. That
// is what makes a token refresh free AND observably stable: a rotation
// rewrites the session record, we re-decode it once, and the userId /
// appId claims come back identical, so the key does not move. The
// persist transform runs on every throttled write, so re-parsing and
// re-hashing every time would be pure waste.
let cachedSessionRaw: string | null | undefined;
let cachedSecretKey = ANONYMOUS_PERSIST_SECRET_KEY;

export const getPersistSecretKey = (): string => {
  const raw = readRawStoredSession();
  if (raw === cachedSessionRaw) return cachedSecretKey;

  cachedSessionRaw = raw;
  cachedSecretKey = derivePersistSecretKey(
    raw ? readStableIdentity(getStoredUser()) : null
  );
  return cachedSecretKey;
};

/** Test seam, and the hook logout could use if it ever needs to. */
export const resetPersistSecretKeyCache = (): void => {
  cachedSessionRaw = undefined;
  cachedSecretKey = ANONYMOUS_PERSIST_SECRET_KEY;
};

// One warning per read attempt. `encryptTransform` calls onError twice
// for a blob that decrypts to garbage (once for the failed JSON parse,
// once from its own outer catch), and two console lines for one
// discarded slice reads like two separate problems.
let decryptFailureReported = false;

let activeSecretKey: string | null = null;
let activeEncryptor: ReturnType<typeof encryptTransform> | null = null;

const getEncryptor = () => {
  const secretKey = getPersistSecretKey();
  if (!activeEncryptor || activeSecretKey !== secretKey) {
    activeSecretKey = secretKey;
    activeEncryptor = encryptTransform({
      secretKey,
      // THE DISCARD PATH. `encryptTransform`'s default onError only
      // console.warns and returns undefined, which is the dangerous
      // answer: redux-persist would then hand `undefined` to
      // autoMergeLevel1, which hard-sets it over the reducer's initial
      // state, and the next selector to touch `state.rooms.rooms`
      // white-screens the app.
      //
      // Throwing instead is what redux-persist actually wants here.
      // `getStoredState` rethrows out of its own try/catch, and
      // `persistReducer` turns that rejection into
      // `rehydrate(undefined, err)`: the whole slice is skipped, the
      // reducer's initial state stands, and the REHYDRATE action's
      // `conditionalUpdate` immediately rewrites storage under the
      // CURRENT key. The user stays logged in (the session record lives
      // in its own localStorage key and is untouched by any of this),
      // they just start with a cold message cache that MAM refills.
      //
      // This is the path taken by: a blob written with the old
      // hardcoded key, a blob belonging to a different account, and a
      // corrupted or truncated value.
      onError: (error: Error) => {
        if (!decryptFailureReported) {
          decryptFailureReported = true;
          console.warn(
            '[ethora] persisted state could not be decrypted with the current ' +
              'session key - discarding the cached slice and starting clean.',
            error?.message
          );
        }
        throw error;
      },
    });
  }
  return activeEncryptor;
};

/**
 * Drop-in replacement for the old fixed-key `encryptTransform`.
 *
 * It has to resolve the key lazily, per call: `encryptTransform`
 * captures `secretKey` when it is constructed, and this module is
 * imported at store-creation time, long before a `<Chat>` consumer has
 * logged anybody in. Resolving on each in/out means the first write
 * after login already uses that user's key.
 */
export const sessionEncryptTransform = createTransform<any, any, any, any>(
  (inboundState, key, fullState) =>
    getEncryptor().in(inboundState, key as never, fullState),
  (outboundState, key, fullState) => {
    decryptFailureReported = false;
    return getEncryptor().out(outboundState, key as never, fullState);
  }
);
