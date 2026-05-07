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
import { ethoraLogger } from '../../helpers/ethoraLogger';

// 60s, not 1.5s. Provider bootstrap fires /chats/my early; chat mount can
// happen many seconds later (route transition, lazy chunk). Without this
// the UI fires a second /chats/my just to refetch the same data — and the
// user sees a "0 rooms" flash while the second request is in flight.
const GET_ROOMS_CACHE_MS = 60_000;
let getRoomsInFlight: Promise<{ items: ApiRoom[] }> | null = null;
let getRoomsInFlightToken = '';
let lastGetRoomsResponse: { items: ApiRoom[] } | null = null;
let lastGetRoomsResponseAt = 0;
let lastGetRoomsResponseToken = '';

export async function getRooms(): Promise<{ items: ApiRoom[] }> {
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
    return getRoomsInFlight;
  }

  getRoomsInFlightToken = token;
  getRoomsInFlight = (async () => {
    const response = await http.get('/chats/my', {
      headers: {
        Authorization: token,
      },
    });
    lastGetRoomsResponse = response.data;
    lastGetRoomsResponseAt = Date.now();
    lastGetRoomsResponseToken = token;
    return response.data;
  })();

  try {
    return await getRoomsInFlight;
  } catch (error) {
    ethoraLogger.log('Error loading rooms');
    return { items: [] };
  } finally {
    getRoomsInFlight = null;
    getRoomsInFlightToken = '';
  }
}

export async function getRoomByName(chatName: string): Promise<ApiRoom> {
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.get(`/chats/my/${chatName}`, {
      headers: {
        Authorization: token,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error('Error updating profile');
  }
}

export async function postRoom(data: PostRoom) {
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.post('/chats', data, {
      headers: {
        Authorization: token,
      },
    });
    return response.data.result;
  } catch (error) {
    throw new Error('Error updating profile');
  }
}

export async function postPrivateRoom(
  username: string,
  title: string = 'Private chat'
): Promise<ApiRoom> {
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.post(
      '/chats/private',
      { username },
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
      `/chats/reports/${chatName}`,
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
      `/chats/users-access`,
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
    const response = await http.delete(`/chats/users-access`, {
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
    const response = await http.delete('/chats', {
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
