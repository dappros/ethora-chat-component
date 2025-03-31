import { store } from '../../roomStore';
import {
  ApiRoom,
  DeleteRoomMember,
  PostAddRoomMember,
  PostReportRoom,
  PostRoom,
} from '../../types/types';
import http from '../apiClient';

export async function getRooms(): Promise<{ items: ApiRoom[] }> {
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.get('/chats/my', {
      headers: {
        Authorization: token,
      },
    });
    return response.data;
  } catch (error) {
    throw new Error('Error updating profile');
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

export async function postPrivateRoom(username: string) {
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

export async function postAddRoomMember(data: PostAddRoomMember) {
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
    return response.data.result;
  } catch (error) {
    throw new Error('Error updating profile');
  }
}

export async function deleteRoomMember(data: DeleteRoomMember) {
  const { roomId, userId } = data;
  const token = store.getState().chatSettingStore.user.token || '';

  try {
    const response = await http.delete(`/chats/users-access`, {
      headers: {
        Authorization: token,
      },
      data: {
        roomId,
        userId,
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
