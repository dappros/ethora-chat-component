import { store } from '../../roomStore';
import { ApiFile } from '../../types/types';
import http from '../apiClient';

export interface GetMyFilesResult {
  items: ApiFile[];
  total: number;
  limit: number;
  offset: number;
}

interface GetMyFilesOptions {
  limit: number;
  offset: number;
  signal?: AbortSignal;
}

// getFilesV2Service (ethora-backend services/api/src/modules/files/services/getFilesV2.service.js)
// returns `{ results, items, pagination: { limit, offset, total }, limit, offset, total }`
// with `results === items`; the v2 envelope middleware also stamps
// `success: true` on top but never renames these fields. Normalize here so
// callers always get a flat `{ items, total, limit, offset }` regardless of
// which of those duplicate shapes the backend happens to answer with.
function normalizeGetMyFilesResponse(data: any, fallback: GetMyFilesOptions): GetMyFilesResult {
  const items: ApiFile[] = data?.items || data?.results || [];
  const pagination = data?.pagination || {};
  return {
    items,
    total: Number.isFinite(Number(pagination.total ?? data?.total))
      ? Number(pagination.total ?? data?.total)
      : items.length,
    limit: Number.isFinite(Number(pagination.limit ?? data?.limit))
      ? Number(pagination.limit ?? data?.limit)
      : fallback.limit,
    offset: Number.isFinite(Number(pagination.offset ?? data?.offset))
      ? Number(pagination.offset ?? data?.offset)
      : fallback.offset,
  };
}

// Same dedup shape as getRooms in rooms.api.ts: two callers asking for the
// same page (token+limit+offset) while a request is already in flight share
// the one response instead of firing a second identical GET.
let getMyFilesInFlight: Promise<GetMyFilesResult> | null = null;
let getMyFilesInFlightKey = '';

export async function getMyFiles(
  options: GetMyFilesOptions
): Promise<GetMyFilesResult> {
  const { limit, offset, signal } = options;
  const token = store.getState().chatSettingStore.user.token || '';
  const key = `${token}:${limit}:${offset}`;

  if (getMyFilesInFlight && getMyFilesInFlightKey === key) {
    return getMyFilesInFlight;
  }

  getMyFilesInFlightKey = key;
  getMyFilesInFlight = (async () => {
    const response = await http.get('/v2/files', {
      headers: {
        Authorization: token,
      },
      params: { limit, offset },
      signal,
    });
    return normalizeGetMyFilesResponse(response.data, { limit, offset });
  })();

  try {
    return await getMyFilesInFlight;
  } finally {
    getMyFilesInFlight = null;
    getMyFilesInFlightKey = '';
  }
}

export async function deleteMyFile(id: string): Promise<void> {
  const token = store.getState().chatSettingStore.user.token || '';

  await http.delete(`/v2/files/${id}`, {
    headers: {
      Authorization: token,
    },
  });
}
