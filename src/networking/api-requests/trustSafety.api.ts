import { store } from '../../roomStore';
import http from '../apiClient';

/**
 * Trust & Safety endpoints the chat component calls.
 *
 *  - GET /v2/apps/:appId/trust-safety  -> { enabled, ageGate, effective }
 *    (any App member; tells the client whether sensitive media is age gated)
 *  - GET /v2/users/me/age               -> { birthYear, isAdult, declaredAt, canDeclareAdult }
 *  - PUT /v2/users/me/age { dateOfBirth: 'YYYY-MM-DD' } -> same; 409 AGE_LOCKED
 */

export interface AppTrustSafety {
  enabled: boolean;
  ageGate: boolean;
  effective?: Record<string, unknown>;
}

export interface UserAge {
  birthYear: number | null;
  isAdult: boolean | null;
  declaredAt: string | null;
  canDeclareAdult: boolean;
}

const authHeaders = () => ({
  Authorization: store.getState().chatSettingStore?.user?.token || '',
});

/**
 * The v2 envelope stamps `success: true` next to the fields, and some routes
 * nest the payload under `data` or `result`: accept all three.
 */
const unwrap = (data: unknown): Record<string, unknown> => {
  if (!data || typeof data !== 'object') return {};
  const record = data as Record<string, unknown>;
  for (const key of ['data', 'result']) {
    const inner = record[key];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
  }
  return record;
};

const asBool = (value: unknown): boolean | null =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : null;

export const normalizeAppTrustSafety = (data: unknown): AppTrustSafety => {
  const record = unwrap(data);
  const effective =
    record.effective && typeof record.effective === 'object'
      ? (record.effective as Record<string, unknown>)
      : undefined;
  const ageGate = asBool(record.ageGate) ?? asBool(effective?.ageGate) ?? true;
  return {
    enabled: asBool(record.enabled) ?? false,
    ageGate,
    ...(effective ? { effective } : {}),
  };
};

export const normalizeUserAge = (data: unknown): UserAge => {
  const record = unwrap(data);
  const age =
    record.age && typeof record.age === 'object'
      ? (record.age as Record<string, unknown>)
      : record;
  const birthYear = Number(age.birthYear);
  return {
    birthYear: Number.isFinite(birthYear) && birthYear > 0 ? birthYear : null,
    isAdult: asBool(age.isAdult),
    declaredAt: typeof age.declaredAt === 'string' ? age.declaredAt : null,
    canDeclareAdult: asBool(age.canDeclareAdult ?? record.canDeclareAdult) ?? true,
  };
};

export async function getAppTrustSafety(appId: string): Promise<AppTrustSafety> {
  const response = await http.get(
    `/v2/apps/${encodeURIComponent(appId)}/trust-safety`,
    { headers: authHeaders() }
  );
  return normalizeAppTrustSafety(response.data);
}

export async function getMyAge(): Promise<UserAge> {
  const response = await http.get('/v2/users/me/age', { headers: authHeaders() });
  return normalizeUserAge(response.data);
}

export async function putMyAge(dateOfBirth: string): Promise<UserAge> {
  const response = await http.put(
    '/v2/users/me/age',
    { dateOfBirth },
    { headers: authHeaders() }
  );
  return normalizeUserAge(response.data);
}

/** The error code the server sends with a 409 once a minor's age is locked. */
export const AGE_LOCKED = 'AGE_LOCKED';

export const errorCodeOf = (error: unknown): string => {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;
  const nested =
    record.error && typeof record.error === 'object'
      ? (record.error as Record<string, unknown>)
      : undefined;
  return String(record.code ?? nested?.code ?? '');
};

export const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;
