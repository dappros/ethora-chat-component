import type { Dispatch } from '@reduxjs/toolkit';
import {
  AppTrustSafety,
  getAppTrustSafety,
  getMyAge,
  putMyAge,
  UserAge,
} from '../networking/api-requests/trustSafety.api';
import {
  AgeState,
  AppPolicyEntry,
  initialAgeState,
  setAge,
  setAgeFailed,
  setAgeLoading,
  setAppPolicy,
  TrustSafetyState,
} from './trustSafetySlice';

/**
 * The once-per-session lookups behind the sensitive media gate. Each one is
 * cached in the trustSafety slice and shared while in flight, so a screen
 * full of sensitive bubbles costs one request, and a failed lookup is not
 * retried until the viewer taps again.
 */

interface StoreLike {
  dispatch: Dispatch;
  getState: () => unknown;
}

const tsState = (store: StoreLike): TrustSafetyState | undefined =>
  (store.getState() as { trustSafety?: TrustSafetyState })?.trustSafety;

const policyInFlight = new Map<string, Promise<AppPolicyEntry>>();
let ageInFlight: Promise<AgeState> | null = null;

/** Test-only: forget in-flight requests between cases. */
export const __resetTrustSafetyRequestsForTests = () => {
  policyInFlight.clear();
  ageInFlight = null;
};

/**
 * Whether sensitive media in this App is age gated. Unknown (no App id, or
 * the lookup failed) answers `ageGate: true`: the server enforces the gate
 * anyway, so asking for the age is the safe side.
 */
export const ensureAppPolicy = async (
  store: StoreLike,
  appId: string | undefined,
  api: { get: (appId: string) => Promise<AppTrustSafety> } = { get: getAppTrustSafety }
): Promise<AppPolicyEntry> => {
  if (!appId) return { status: 'error', ageGate: true };
  const cached = tsState(store)?.policy?.[appId];
  if (cached?.status === 'loaded') return cached;
  const pending = policyInFlight.get(appId);
  if (pending) return pending;

  store.dispatch(setAppPolicy({ appId, status: 'loading' }));
  const request = api
    .get(appId)
    .then((policy): AppPolicyEntry => {
      const entry: AppPolicyEntry = {
        status: 'loaded',
        enabled: policy.enabled,
        ageGate: policy.ageGate,
      };
      store.dispatch(setAppPolicy({ appId, ...entry }));
      return entry;
    })
    .catch((): AppPolicyEntry => {
      const entry: AppPolicyEntry = { status: 'error', ageGate: true };
      store.dispatch(setAppPolicy({ appId, ...entry }));
      return entry;
    })
    .finally(() => {
      policyInFlight.delete(appId);
    });
  policyInFlight.set(appId, request);
  return request;
};

const toAgeState = (age: UserAge): AgeState => ({ status: 'loaded', ...age });

/** The viewer's declared age; asked once per session. */
export const ensureMyAge = async (
  store: StoreLike,
  api: { get: () => Promise<UserAge> } = { get: getMyAge }
): Promise<AgeState> => {
  const cached = tsState(store)?.age;
  if (cached?.status === 'loaded') return cached;
  if (ageInFlight) return ageInFlight;

  store.dispatch(setAgeLoading());
  ageInFlight = api
    .get()
    .then((age) => {
      store.dispatch(setAge(age));
      return toAgeState(age);
    })
    .catch((): AgeState => {
      store.dispatch(setAgeFailed());
      // Unknown: the age dialog asks for it.
      return { ...initialAgeState, status: 'error' };
    })
    .finally(() => {
      ageInFlight = null;
    });
  return ageInFlight;
};

/** PUT /v2/users/me/age. Throws the API error (409 AGE_LOCKED included). */
export const declareMyAge = async (
  store: StoreLike,
  dateOfBirth: string,
  api: { put: (dateOfBirth: string) => Promise<UserAge> } = { put: putMyAge }
): Promise<AgeState> => {
  const age = await api.put(dateOfBirth);
  store.dispatch(setAge(age));
  return toAgeState(age);
};
