import axios from 'axios';
import { store } from '../../roomStore';
import {
  ApiRoom,
  DeleteRoomMember,
  PostAddRoomMember,
  PostReportRoom,
  PostRoom,
  RoomMember,
} from '../../types/types';
import http from '../apiClient';
import { createSharedRequest, SharedRequest } from '../sharedRequest';
import { ethoraLogger } from '../../helpers/ethoraLogger';

// 60s, not 1.5s. Provider bootstrap fires /chats/my early; chat mount can
// happen many seconds later (route transition, lazy chunk). Without this
// the UI fires a second /chats/my just to refetch the same data - and the
// user sees a "0 rooms" flash while the second request is in flight.
const GET_ROOMS_CACHE_MS = 60_000;
export type GetRoomsResult = { items: ApiRoom[]; failed?: boolean };
let getRoomsInFlight: SharedRequest<{ items: ApiRoom[] }> | null = null;
let getRoomsInFlightToken = '';
let lastGetRoomsResponse: { items: ApiRoom[] } | null = null;
let lastGetRoomsResponseAt = 0;
let lastGetRoomsResponseToken = '';
// Bumped by invalidateRoomsCache(). A getRooms() request that was already
// in flight when a mute/unmute toggle called invalidateRoomsCache() would
// otherwise write its (pre-toggle) response into the cache when it finally
// resolves, re-poisoning the exact cache entry the toggle just cleared -
// see the generation check in getRooms() below.
let roomsCacheGeneration = 0;

export function invalidateRoomsCache() {
  lastGetRoomsResponse = null;
  lastGetRoomsResponseAt = 0;
  lastGetRoomsResponseToken = '';
  roomsCacheGeneration++;
}

// An aborted request (AbortSignal fired) must never poison the cache or the
// in-flight dedup: axios rejects it with a CanceledError, which we treat
// like any other transport failure below - lastGetRoomsResponse is only
// written on the success path, and the in-flight entry is always cleared in
// the finally so the next (non-aborted) caller gets a fresh request instead
// of hanging on a promise that will never resolve for them.
export async function getRooms(signal?: AbortSignal): Promise<GetRoomsResult> {
  const token = store.getState().chatSettingStore.user.token || '';
  const now = Date.now();

  if (
    lastGetRoomsResponse &&
    lastGetRoomsResponseToken === token &&
    now - lastGetRoomsResponseAt < GET_ROOMS_CACHE_MS
  ) {
    return lastGetRoomsResponse;
  }

  if (getRoomsInFlight && getRoomsInFlightToken === token) {
    return getRoomsInFlight.join(signal);
  }

  getRoomsInFlightToken = token;
  const requestGeneration = roomsCacheGeneration;
  const shared = createSharedRequest(async (sharedSignal) => {
    const response = await http.get('/v1/chats/my', {
      headers: {
        Authorization: token,
      },
      signal: sharedSignal,
    });
    // Only cache this response if nothing invalidated the cache while it
    // was in flight (e.g. a mute/unmute toggle). Otherwise this request
    // started before the toggle and carries its pre-toggle `muted` value -
    // writing it now would silently undo invalidateRoomsCache().
    if (roomsCacheGeneration === requestGeneration) {
      lastGetRoomsResponse = response.data;
      lastGetRoomsResponseAt = Date.now();
      lastGetRoomsResponseToken = token;
    }
    return response.data as { items: ApiRoom[] };
  });
  getRoomsInFlight = shared;

  try {
    return await shared.join(signal);
  } catch (error) {
    if (axios.isCancel(error)) {
      // Let the caller see the cancellation instead of silently returning
      // an empty list - a caller that aborted its own request already
      // knows why and will decide whether to retry.
      throw error;
    }
    ethoraLogger.log('Error loading rooms');
    // `failed: true` is the difference between "the account has no chats"
    // and "we could not find out". Returning a bare empty list made every
    // transport failure (a 401 while the freshly issued token is still
    // propagating on a first login, an offline blip) indistinguishable
    // from a genuinely empty account, and the caller then latched
    // "rooms resolved, cleanly, with zero rooms" - which is what put the
    // "No room. Let's create one!" CTA on screen seconds before the real
    // rooms arrived. Kept as a field rather than a throw so the existing
    // callers that only read `.items` keep working unchanged.
    return { items: [], failed: true };
  } finally {
    getRoomsInFlight = null;
    getRoomsInFlightToken = '';
  }
}

// In-flight dedup: onMembersRefreshSignal can fire once per broadcast
// stanza for the same room, and each occupant would otherwise issue an
// uncoalesced GET per stanza.
const roomByNameInflight = new Map<string, SharedRequest<ApiRoom>>();

export async function getRoomByName(
  chatName: string,
  signal?: AbortSignal
): Promise<ApiRoom> {
  const token = store.getState().chatSettingStore.user.token || '';
  const key = `${token}|${chatName}`;

  const inflight = roomByNameInflight.get(key);
  if (inflight) return inflight.join(signal);

  const shared = createSharedRequest((sharedSignal) =>
    http
      .get(`/v1/chats/my/${chatName}`, {
        headers: {
          Authorization: token,
        },
        signal: sharedSignal,
      })
      .then((response) => response.data as ApiRoom)
      .catch((error) => {
        if (axios.isCancel(error)) {
          throw error;
        }
        throw new Error('Error updating profile');
      })
      .finally(() => {
        roomByNameInflight.delete(key);
      })
  );

  roomByNameInflight.set(key, shared);
  return shared.join(signal);
}

// PUT/DELETE /v1/chats/my/{chatName}/mute - the caller's own per-chat mute
// preference. Idempotent on both ends and QA-only for now (live on
// api.chat-qa.ethora.com, not yet on prod api.chat.ethora.com) - a prod
// caller gets a 404 the same as any other unknown route, which is why the
// UI only offers the toggle once a room has already reported a `muted`
// boolean (see useRoomMute's `isSupported`).
export async function muteRoom(
  chatName: string
): Promise<{ chatName: string; muted: boolean } | undefined> {
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.put(
      `/v1/chats/my/${chatName}/mute`,
      {},
      {
        headers: {
          Authorization: token,
        },
      }
    );
    // The 60s /chats/my cache would otherwise keep serving the pre-mute
    // `muted` value to anything that calls getRooms() before it expires.
    invalidateRoomsCache();
    return response.data?.result;
  } catch (error) {
    throw new Error('Error muting chat');
  }
}

export async function unmuteRoom(
  chatName: string
): Promise<{ chatName: string; muted: boolean } | undefined> {
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.delete(`/v1/chats/my/${chatName}/mute`, {
      headers: {
        Authorization: token,
      },
    });
    invalidateRoomsCache();
    return response.data?.result;
  } catch (error) {
    throw new Error('Error unmuting chat');
  }
}

export async function postRoom(data: PostRoom) {
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.post('/v1/chats', data, {
      headers: {
        Authorization: token,
      },
    });
    return response.data.result;
  } catch (error) {
    throw new Error('Error updating profile');
  }
}

// Create (or resolve) the 1:1 room with `username`.
//
// `e2ee` selects which of the pair's two possible rooms this addresses rather
// than toggling one: the backend keeps the encrypted room as a room of its
// own, so asking for it on a pair that only has a plaintext chat creates it
// alongside, and an encrypted room stays encrypted for life. Idempotent per
// variant.
//
// The field is omitted from the body unless it is true, on purpose. The
// backend validates this payload with a Joi object that rejects unknown keys,
// so sending `e2ee: false` to a backend predating the feature would 422 every
// plain private chat. Omitting it keeps the default request byte-identical to
// what older backends already accept; only the encrypted variant - which the
// UI gates behind `config.e2ee.enabled` anyway - needs a backend that knows
// the field.
export async function postPrivateRoom(
  username: string,
  e2ee: boolean = false
): Promise<ApiRoom> {
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.post(
      '/v1/chats/private',
      e2ee ? { username, e2ee: true } : { username },
      {
        headers: {
          Authorization: token,
        },
      }
    );
    return response.data.result;
  } catch (error) {
    throw new Error('Error updating profile');
  }
}

export async function postReportRoom(data: PostReportRoom) {
  const { chatName, category, text } = data;
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.post(
      `/v1/chats/reports/${chatName}`,
      { category, text },
      {
        headers: {
          Authorization: token,
        },
      }
    );
    return response.data.result;
  } catch (error) {
    throw new Error('Error updating profile');
  }
}

export async function postAddRoomMember(
  data: PostAddRoomMember
): Promise<RoomMember[]> {
  const { chatName, members } = data;
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.post(
      `/v1/chats/users-access`,
      { chatName, members },
      {
        headers: {
          Authorization: token,
        },
      }
    );
    return response?.data?.results || [];
  } catch (error) {
    throw new Error('Error updating profile');
  }
}

export async function deleteRoomMember(data: DeleteRoomMember) {
  const { roomId, members } = data;
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.delete(`/v1/chats/users-access`, {
      headers: {
        Authorization: token,
      },
      data: {
        chatName: roomId,
        members,
      },
    });
    return response.data.result;
  } catch (error) {
    throw new Error('Error updating profile');
  }
}

export async function deleteRoom(name: string) {
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.delete('/v1/chats', {
      headers: {
        Authorization: token,
      },
      data: { name },
    });
    return response.data.result;
  } catch (error) {
    throw new Error('Error deleting room');
  }
}

// POST /v1/chats/call/create/{chatName}
// Swagger documents the body as `additionalProperties: true` - we forward
// `kind: 'audio' | 'video'` so the server can stamp it on the broadcast
// call-token stanza for the callee. When the server doesn't recognize the
// field both sides still fall through to a video call (the default), which
// matches the prior single-mode behavior.
export async function createChatCall(
  chatName: string,
  options?: { kind?: 'audio' | 'video' }
): Promise<void> {
  const token = store.getState().chatSettingStore.user.token || '';
  const kind = options?.kind || 'video';

  try {
    await http.post(
      `/v1/chats/call/create/${chatName}`,
      { kind },
      {
        headers: {
          Authorization: token,
        },
      }
    );
  } catch (error) {
    throw new Error('Error creating chat call');
  }
}
