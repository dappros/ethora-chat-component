import { store } from '../../roomStore';
import http from '../apiClient';
import type {
  CreateScheduledCallInput,
  ScheduledCall,
  ScheduledCallDetails,
  ScheduledCallLinks,
  ScheduledCallOpenError,
  ScheduledCallWithLinks,
  UpdateScheduledCallInput,
} from '../../types/models/scheduledCall.model';

// REST side of scheduled calls (booking), see the backend contract:
//   POST   /v1/chats/calls/scheduled
//   GET    /v1/chats/calls/scheduled?chatName=&from=&to=
//   GET    /v1/chats/calls/scheduled/:slug
//   PATCH  /v1/chats/calls/scheduled/:slug
//   DELETE /v1/chats/calls/scheduled/:slug
// All user-JWT. The calendar links in every answer are built by the backend;
// nothing here composes one.

const authHeaders = () => ({
  headers: { Authorization: store.getState().chatSettingStore.user?.token || '' },
});

/** What went wrong, in the terms the UI needs. */
export class ScheduledCallApiError extends Error {
  readonly status: number | null;
  readonly reason: ScheduledCallOpenError;
  /** The server's own `code` (or `error`) string, when it sent one. */
  readonly code: string | null;

  constructor(
    status: number | null,
    reason: ScheduledCallOpenError,
    code: string | null
  ) {
    super(code || reason);
    this.name = 'ScheduledCallApiError';
    this.status = status;
    this.reason = reason;
    this.code = code;
  }
}

const toApiError = (error: unknown): ScheduledCallApiError => {
  if (error instanceof ScheduledCallApiError) return error;
  const response = (error as { response?: { status?: number; data?: any } })
    ?.response;
  const status = typeof response?.status === 'number' ? response.status : null;
  // The backend answers { error, code }: `code` (START_IN_PAST,
  // CALL_CANCELLED, VALIDATION_ERROR, FORBIDDEN, ...) wins over the text.
  const rawCode = response?.data?.code ?? response?.data?.error ?? response?.data?.message;
  const code = typeof rawCode === 'string' ? rawCode : null;
  if (status === 403) {
    return new ScheduledCallApiError(status, 'not-a-member', code);
  }
  if (status === 404) {
    return new ScheduledCallApiError(status, 'not-found', code);
  }
  return new ScheduledCallApiError(status, 'network', code);
};

const asCall = (value: unknown): ScheduledCall => {
  const call = value as ScheduledCall | undefined;
  if (!call || typeof call !== 'object' || typeof call.slug !== 'string') {
    throw new ScheduledCallApiError(null, 'network', 'bad-response');
  }
  return call;
};

const asLinks = (value: unknown): ScheduledCallLinks =>
  (value && typeof value === 'object' ? value : {}) as ScheduledCallLinks;

const asWithLinks = (data: any): ScheduledCallWithLinks => ({
  scheduledCall: asCall(data?.scheduledCall),
  links: asLinks(data?.links),
});

export async function createScheduledCall(
  input: CreateScheduledCallInput
): Promise<ScheduledCallWithLinks> {
  try {
    const response = await http.post(
      '/v1/chats/calls/scheduled',
      input,
      authHeaders()
    );
    return asWithLinks(response?.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listScheduledCalls(params: {
  chatName: string;
  from?: string;
  to?: string;
}): Promise<ScheduledCallWithLinks[]> {
  try {
    const response = await http.get('/v1/chats/calls/scheduled', {
      ...authHeaders(),
      params,
    });
    const items = Array.isArray(response?.data?.items) ? response.data.items : [];
    return items.map(asWithLinks);
  } catch (error) {
    throw toApiError(error);
  }
}

/** GET one call by slug. 404 -> `not-found`, 403 -> `not-a-member`. */
export async function getScheduledCall(
  slug: string
): Promise<ScheduledCallDetails> {
  try {
    const response = await http.get(
      `/v1/chats/calls/scheduled/${encodeURIComponent(slug)}`,
      authHeaders()
    );
    const data = response?.data;
    const chat = data?.chat;
    if (!chat || typeof chat.jid !== 'string') {
      throw new ScheduledCallApiError(null, 'network', 'bad-response');
    }
    return { ...asWithLinks(data), chat };
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updateScheduledCall(
  slug: string,
  patch: UpdateScheduledCallInput
): Promise<ScheduledCallWithLinks> {
  try {
    const response = await http.patch(
      `/v1/chats/calls/scheduled/${encodeURIComponent(slug)}`,
      patch,
      authHeaders()
    );
    return asWithLinks(response?.data);
  } catch (error) {
    throw toApiError(error);
  }
}

export async function cancelScheduledCall(slug: string): Promise<ScheduledCall> {
  try {
    const response = await http.delete(
      `/v1/chats/calls/scheduled/${encodeURIComponent(slug)}`,
      authHeaders()
    );
    return asCall(response?.data?.scheduledCall);
  } catch (error) {
    throw toApiError(error);
  }
}
